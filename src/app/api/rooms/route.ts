import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// GET: The Student Lobby calls this to see what's live
export async function GET() {
  try {
    const rooms = await prisma.room.findMany({
      where: { isLive: true },
      include: { attendees: true } // Show how many people are inside
    });
    return NextResponse.json(rooms);
  } catch {
    return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 });
  }
}

// POST: The Facilitator Setup calls this to "Go Live"
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const newRoom = await prisma.room.create({
      data: {
        title: body.title || "Untitled Session",
        capacity: body.capacity || 20,
        isLive: true,
        passcode: "1234" 
      }
    });
    return NextResponse.json(newRoom);
  } catch (error) {
    console.error("Room Creation Error:", error);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
