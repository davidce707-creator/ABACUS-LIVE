import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('roomId');

    if (!roomId) return NextResponse.json([], { status: 400 });

    const attendees = await prisma.attendee.findMany({
      where: { roomId }
    });
    return NextResponse.json(attendees);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('roomId');
    const name = searchParams.get('name');

    if (!roomId || !name) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    await prisma.attendee.deleteMany({ where: { roomId, name } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove attendee' }, { status: 500 });
  }
}
