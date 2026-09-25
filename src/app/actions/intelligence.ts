"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function processClassroomSignal(roomId: string, seatId: string, rawInput: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
    Analyze the following classroom interaction snippet: "${rawInput}"
    Classify the student's state into one of these types: CONFUSION, ENGAGED, SILENCE, DRIFT.
    Return only a JSON object with two keys: "greenBeads" (0-5) and "redBeads" (0-5) representing engagement vs friction.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = JSON.parse(result.response.text());

    const signal = await prisma.signal.create({
      data: {
        roomId,
        seatId,
        greenBeads: response.greenBeads ?? 0,
        redBeads: response.redBeads ?? 0,
        intensity: ((response.greenBeads ?? 0) - (response.redBeads ?? 0)) / 5,
      },
    });

    return { success: true, signal };
  } catch (error) {
    console.error("Intelligence Core Error:", error);
    return { success: false };
  }
}

export async function logBeadDisplacement(data: {
  roomId: string;
  seatId: string;
  studentName: string;
  greenBeads: number;
  redBeads: number;
  intensity: number;
}) {
  const { intensity } = data;

  const signal = await prisma.signal.create({
    data: {
      roomId: data.roomId,
      seatId: data.seatId,
      studentName: data.studentName,
      greenBeads: data.greenBeads,
      redBeads: data.redBeads,
      intensity,
    },
  });

  return { success: true, signal };
}

export async function generateTeacherInsight(roomId: string) {
  if (!process.env.GEMINI_API_KEY) {
    console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables!");
    return { success: true, nudge: "System Alert: Please add your GEMINI_API_KEY to the .env file and restart the server." };
  }
  try {
    const recentSignals = await prisma.signal.findMany({
      where: {
        roomId,
        timestamp: {
          gte: new Date(Date.now() - 5 * 60 * 1000)
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    if (recentSignals.length === 0) {
      return { success: true, nudge: "The room is quiet. Awaiting student signals." };
    }

    let totalFriction = 0;
    let totalConfidence = 0;
    
    for (const sig of recentSignals) {
      totalFriction += sig.redBeads;
      totalConfidence += sig.greenBeads;
    }

    const dataSummary = `
      In the last 5 minutes:
      Total beads moved to Friction (Red): ${totalFriction}
      Total beads moved to Confidence (Green): ${totalConfidence}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
      You are the ABACUS AI, a smart, conversational co-pilot for a classroom teacher. 
      Your job is to read the physical dynamics of the room and provide a single, helpful nudge.
      Your tone is empathetic, coaching, and concise (max 2 sentences). Do not use robotic data-speak.
      
      Here is the current room data:
      ${dataSummary}

      Based on this, what should the teacher do? (e.g., "It looks like the room is experiencing high friction right now. Consider pausing for a peer-to-peer review.")
    `;

    const result = await model.generateContent(prompt);
    const nudge = result.response.text().trim();

    return { success: true, nudge };

  } catch (error) {
    console.error("Insight generation failed:", error);
    return { success: false, nudge: "Unable to connect to ABACUS Intelligence." };
  }
}

export async function endSession(roomId: string) {
  try {
    await prisma.room.update({
      where: { id: roomId },
      data: { isLive: false }
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to end session:", error);
    return { success: false };
  }
}

export async function assignSeat(guestName: string, roomId: string) {
  try {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { attendees: true }
    });

    if (!room) return { success: false, error: "Room not found." };

    // Check if this guest already has a seat in this room
    const existingAttendee = await prisma.attendee.findFirst({
      where: { name: guestName, roomId }
    });
    
    if (existingAttendee) {
      return { success: true, seatId: existingAttendee.seatId };
    }

    // Generate seat grid based on room capacity
    const allSeats: string[] = [];
    const rows = 'ABCDEFGHIJ';
    const cols = Math.ceil(room.capacity / rows.length);
    for (let r = 0; r < rows.length && allSeats.length < room.capacity; r++) {
      for (let c = 1; c <= cols && allSeats.length < room.capacity; c++) {
        allSeats.push(`${rows[r]}${c}`);
      }
    }

    // Find available seats scoped to this room
    const takenSeats = room.attendees.map(a => a.seatId);
    const availableSeat = allSeats.find(seat => !takenSeats.includes(seat));

    if (!availableSeat) return { success: false, error: "The room is full." };

    await prisma.attendee.create({
      data: {
        name: guestName,
        seatId: availableSeat,
        roomId
      }
    });

    return { success: true, seatId: availableSeat };
  } catch (error: any) {
    console.error("DETAILED USHER ERROR:", error.message);
    return { success: false, error: `Seating Error: ${error.message}` };
  }
}
