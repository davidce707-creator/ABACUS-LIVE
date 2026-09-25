"use client";

import { useState, useEffect, useCallback } from 'react';
import FacilitatorSeat from '@/components/FacilitatorSeat';
import FacilitatorControls from '@/components/FacilitatorControls';
import { supabase } from '@/lib/supabaseClient';


interface Room {
  id: string;
  title: string;
  capacity: number;
}

interface Signal {
  seatId: string;
  studentName: string;
  intensity: number;
  greenBeads: number;
  redBeads: number;
  timestamp: string;
}

interface Attendee {
  name: string;
  seatId: string;
}

// Mirrors the seatId generation in assignSeat (intelligence.ts)
function generateSeatIds(capacity: number): string[] {
  const rows = 'ABCDEFGHIJ';
  const cols = Math.ceil(capacity / rows.length);
  const seats: string[] = [];
  for (let r = 0; r < rows.length && seats.length < capacity; r++) {
    for (let c = 1; c <= cols && seats.length < capacity; c++) {
      seats.push(`${rows[r]}${c}`);
    }
  }
  return seats;
}

function getGridCols(capacity: number): string {
  if (capacity <= 6) return 'grid-cols-2 sm:grid-cols-3';
  if (capacity <= 16) return 'grid-cols-4';
  return 'grid-cols-5 md:grid-cols-8';
}

export default function MirrorDashboard({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [roster, setRoster] = useState<Record<string, string>>({});
  const [signals, setSignals] = useState<Record<string, Signal>>({});

  // Fetch room metadata (title + capacity)
  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const res = await fetch('/api/rooms');
        const rooms: Room[] = await res.json();
        const found = rooms.find(r => r.id === roomId);
        if (found) setRoom(found);
      } catch (e) { console.error("Room fetch error", e); }
    };
    fetchRoom();
  }, [roomId]);

  // Prisma roster as the reliable source of truth for student names
  const fetchRoster = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/roster?roomId=${roomId}`);
      const data: Attendee[] = await res.json();
      const map: Record<string, string> = {};
      data.forEach(a => { map[a.seatId] = a.name; });
      setRoster(map);
    } catch (e) { console.error("Roster error", e); }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    fetchRoster();
    const interval = setInterval(fetchRoster, 3000);
    return () => clearInterval(interval);
  }, [roomId, fetchRoster]);

  // Supabase Realtime — instant roster update on Attendee INSERT/DELETE
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`attendee-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Attendee', filter: `roomId=eq.${roomId}` },
        () => { fetchRoster(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, fetchRoster]);


  // Fetch signals
  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await fetch(`/api/signals?roomId=${roomId}`);
        const data: Signal[] = await res.json();
        const map: Record<string, Signal> = {};
        data.forEach(s => { map[s.seatId] = s; });
        setSignals(map);
      } catch (e) { console.error("Signal error", e); }
    };
    const interval = setInterval(fetchSignals, 2000);
    return () => clearInterval(interval);
  }, [roomId]);

  const seatIds = room ? generateSeatIds(room.capacity) : [];

  return (
    <div className="min-h-screen bg-abacus-bone">
      <FacilitatorControls roomId={roomId} roomTitle={room?.title ?? ''} />

      <div className="p-10">
        <header className="mb-12">
          <h2 className="text-[10px] font-mono tracking-widest text-gray-400 uppercase">
            Live Map: {room?.title ?? 'Loading...'}
          </h2>
          {room && (
            <p className="text-sm text-gray-400 font-mono mt-1">{room.capacity} Seats Total</p>
          )}
        </header>

        {/* Active Students bar — derived from live roster */}
        <div className="mb-10">
          <p className="text-[9px] font-mono text-gray-400 uppercase tracking-widest mb-4">Active Students</p>
          <div className="flex gap-3">
            {Array.from({ length: 5 }, (_, i) => {
              const name = Object.values(roster)[i] ?? null;
              return (
                <div
                  key={i}
                  className={`flex-1 h-14 rounded-2xl border-2 flex items-center justify-center transition-all duration-500 ${
                    name ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-dashed border-gray-200'
                  }`}
                >
                  {name ? (
                    <span className="text-xs font-medium text-abacus-charcoal truncate px-2">{name}</span>
                  ) : (
                    <span className="text-[9px] font-mono text-gray-300 uppercase">Slot {i + 1}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={`grid gap-6 ${room ? getGridCols(room.capacity) : ''}`}>
          {seatIds.map(seatId => (
            <FacilitatorSeat
              key={seatId}
              seatId={seatId}
              studentName={roster[seatId] ?? signals[seatId]?.studentName}
              greenBeads={signals[seatId]?.greenBeads ?? 0}
              redBeads={signals[seatId]?.redBeads ?? 0}
              timestamp={signals[seatId]?.timestamp}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
