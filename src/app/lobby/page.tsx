"use client";

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { assignSeat } from '@/app/actions/intelligence';

function StudentLobbyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const guestName = searchParams.get('name')?.trim() || 'Guest';
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/rooms');
        const data = await res.json();
        setRooms(data.filter((r: any) => r.isLive));
      } catch (e) { console.error("Lobby Error", e); }
      finally { setLoading(false); }
    };
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  const joinRoom = async (roomId: string) => {
    const res = await assignSeat(guestName, roomId);
    if (!res.success) {
      alert(res.error);
      return;
    }

    router.push(`/student/${roomId}?seat=${res.seatId}&name=${guestName}`);
  };

  return (
    <div className="min-h-screen bg-abacus-bone p-8 flex flex-col items-center">
      <div className="w-full max-w-sm">
        <header className="mb-12">
          <h1 className="text-[10px] font-mono tracking-[0.4em] text-gray-400 uppercase mb-2">Student Lobby</h1>
          <p className="text-xl font-light text-abacus-charcoal">
            Welcome,{' '}
            <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 600 }}>
              {guestName}
            </span>
            .
          </p>
        </header>

        <h2 className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-6">Live Classrooms</h2>

        <div className="space-y-4">
          <AnimatePresence>
            {rooms.length > 0 ? (
              rooms.map((room) => (
                <motion.button
                  key={room.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => joinRoom(room.id)}
                  className="w-full bg-white border border-gray-100 p-6 rounded-2xl flex justify-between items-center hover:border-abacus-charcoal transition-all shadow-sm group"
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-abacus-charcoal">{room.title}</p>
                    <p className="text-[10px] font-mono text-gray-400 uppercase mt-1">
                      {room.capacity - (room.attendees?.length || 0)} Seats Available
                    </p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </motion.button>
              ))
            ) : (
              !loading && (
                <p className="text-center py-12 text-xs font-mono text-gray-400 italic">
                  The lobby is quiet. No classes are live.
                </p>
              )
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function StudentLobby() {
  return (
    <Suspense>
      <StudentLobbyContent />
    </Suspense>
  );
}
