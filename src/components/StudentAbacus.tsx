"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { logBeadDisplacement } from '@/app/actions/intelligence';
import AbacusSeal from '@/components/AbacusSeal';
import { supabase } from '@/lib/supabaseClient';

const BEAD_SIZE = 48;
const BEAD_GAP = 2;
const SPACE = BEAD_SIZE + BEAD_GAP;
const TRACK_WIDTH = 760;
const MAX_TRAVEL = (TRACK_WIDTH / 2) - (BEAD_SIZE / 2) - 8;
const INITIAL_POSITIONS = [-100, -50, 0, 50, 100];

export default function StudentAbacus({ roomId }: { roomId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const seatId = searchParams.get('seat') || 'A1';
  const studentName = searchParams.get('name') || 'Guest';

  const [isTerminated, setIsTerminated] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isLogging, setIsLogging] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartPositions = useRef<number[]>([]);
  const [positions, setPositions] = useState([...INITIAL_POSITIONS]);

  // --- Presence tracking — delete Prisma attendee on leave ---
  const markLobby = useCallback(() => {
    if (!roomId || !studentName) return;
    fetch(`/api/roster?roomId=${roomId}&name=${encodeURIComponent(studentName)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }, [roomId, studentName]);

  useEffect(() => {
    const handleBeforeUnload = () => markLobby();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      markLobby();
    };
  }, [markLobby]);

  // --- Realtime termination — instant on Room UPDATE isLive → false ---
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room-status-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'Room', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new && (payload.new as { isLive: boolean }).isLive === false) {
            setIsTerminated(true);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  // --- Heartbeat (fallback if Realtime misses) ---
  useEffect(() => {
    if (isTerminated || !roomId) return;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.isLive === false) setIsTerminated(true);
      } catch {
        console.warn("Heartbeat missed. Maintaining session...");
      }
    };
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [roomId, isTerminated]);

  // --- Countdown redirect ---
  useEffect(() => {
    if (isTerminated && countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (isTerminated && countdown === 0) {
      router.push('/lobby');
    }
  }, [isTerminated, countdown, router]);

  // --- Bead physics ---
  const handlePanStart = () => {
    setIsDragging(true);
    dragStartPositions.current = [...positions];
  };

  const handlePan = (index: number, offsetX: number) => {
    const newPositions = [...dragStartPositions.current];
    newPositions[index] += offsetX;
    const absoluteMinX = -MAX_TRAVEL + (index * SPACE);
    const absoluteMaxX = MAX_TRAVEL - ((4 - index) * SPACE);
    if (newPositions[index] < absoluteMinX) newPositions[index] = absoluteMinX;
    if (newPositions[index] > absoluteMaxX) newPositions[index] = absoluteMaxX;
    for (let i = index; i < 4; i++) {
      if (newPositions[i] + SPACE > newPositions[i + 1]) newPositions[i + 1] = newPositions[i] + SPACE;
    }
    for (let i = index; i > 0; i--) {
      if (newPositions[i] - SPACE < newPositions[i - 1]) newPositions[i - 1] = newPositions[i] - SPACE;
    }
    setPositions(newPositions);
  };

  const handlePanEnd = () => setIsDragging(false);

  useEffect(() => {
    if (isDragging || isTerminated) return;
    const isCentered = positions.every((p, i) => Math.abs(p - INITIAL_POSITIONS[i]) < 2);
    if (isCentered) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => autoLogData(), 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [positions, isDragging, isTerminated]);

  const autoLogData = async () => {
    const redCount   = positions.filter(p => p < -120).length;
    const greenCount = positions.filter(p => p > 120).length;
    setIsLogging(true);
    setPositions([...INITIAL_POSITIONS]);
    try {
      await logBeadDisplacement({
        roomId, seatId,
        studentName,
        greenBeads: greenCount,
        redBeads: redCount,
        intensity: (greenCount - redCount) / 5,
      });
    } catch (err) { console.error("Log failed", err); }
    finally { setIsLogging(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-abacus-bone p-6 overflow-hidden relative">

      {/* Manual exit */}
      {!isTerminated && (
        <button
          onClick={() => router.push('/lobby')}
          className="absolute top-8 left-8 z-20 flex items-center gap-2 group focus:outline-none"
        >
          <div className="w-10 h-10 rounded-full border border-gray-200 bg-white flex items-center justify-center group-hover:bg-gray-50 group-hover:border-gray-300 transition-all shadow-sm">
            <span className="text-gray-400 text-sm">←</span>
          </div>
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
            Return to Lobby
          </span>
        </button>
      )}

      {/* Brand seal — 15% opacity ambient mark */}
      <div className="absolute bottom-8 right-8 pointer-events-none">
        <AbacusSeal opacity={0.15} dotSize={8} gap={5} />
      </div>

      {/* Bead channel — blurs out on termination */}
      <div className={`w-full max-w-4xl flex flex-col items-center transition-all duration-700 ${isTerminated ? 'blur-sm scale-95 opacity-30' : ''}`}>
        <div className="text-center mb-16 h-8">
          <h2 className="text-[10px] font-mono tracking-[0.3em] text-gray-400 uppercase">
            {isLogging ? "Recording State..." : "Current Stance"}
          </h2>
        </div>

        {/* The Channel */}
        <div className="relative h-28 w-full max-w-[760px] bg-white rounded-full shadow-inner border border-gray-200 flex items-center justify-center overflow-hidden">
          <div className="absolute left-0 w-[40%] h-full bg-gradient-to-r from-red-50 to-transparent pointer-events-none" />
          <div className="absolute left-10 text-xs font-mono text-red-400 font-bold tracking-widest pointer-events-none opacity-60 uppercase">Friction</div>
          <div className="absolute right-0 w-[40%] h-full bg-gradient-to-l from-green-50 to-transparent pointer-events-none" />
          <div className="absolute right-10 text-xs font-mono text-green-500 font-bold tracking-widest pointer-events-none opacity-60 uppercase">Confidence</div>
          <div className="absolute w-[280px] h-full border-x border-gray-100 bg-gray-50/50 pointer-events-none flex justify-center items-center">
            <div className="w-[2px] h-8 bg-gray-300 rounded-full" />
          </div>

          <div className="relative flex items-center justify-center w-full h-full">
            {positions.map((pos, i) => (
              <motion.div
                key={i}
                onPanStart={handlePanStart}
                onPan={(_, info) => handlePan(i, info.offset.x)}
                onPanEnd={handlePanEnd}
                animate={{ x: pos }}
                transition={{
                  type: "spring",
                  stiffness: isDragging ? 1200 : 150,
                  damping:   isDragging ? 50    : 25,
                  mass:      isDragging ? 0.1   : 1.5,
                }}
                className={`absolute w-12 h-12 rounded-full shadow-md cursor-grab active:cursor-grabbing border-2 transition-colors duration-300 z-10
                  ${pos > 120 ? 'bg-green-400 border-green-500' :
                    pos < -120 ? 'bg-red-400 border-red-500' :
                    'bg-white border-gray-200'}`}
              />
            ))}
          </div>
        </div>

        <p className="mt-12 text-center text-[10px] text-gray-400 font-mono italic">
          Beads will reset 3s after your last movement.
        </p>
      </div>

      {/* --- Termination overlay — spec: full arch logo + seal at 100% --- */}
      <AnimatePresence>
        {isTerminated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-50 bg-abacus-bone flex flex-col items-center justify-center p-8 text-center"
          >
            {/* Full arch logo */}
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="flex flex-col items-center mb-16"
            >
              <AbacusSeal opacity={1} dotSize={14} gap={8} animate />
              <h1
                className="mt-5 text-3xl tracking-[0.15em] text-abacus-charcoal"
                style={{ fontFamily: 'var(--font-logotype)', fontWeight: 700 }}
              >
                ABACUS
              </h1>
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-[0.3em] mt-1">
                Learning made accountable
              </p>
            </motion.div>

            {/* Message */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex flex-col items-center gap-6"
            >
              <h2
                className="text-xl text-abacus-charcoal font-light"
                style={{ fontFamily: 'var(--font-headline)' }}
              >
                Thank you for your participation.
              </h2>
              <p className="text-xs text-gray-400">This class session is now over.</p>

              {/* Countdown ring */}
              <div className="relative w-14 h-14 flex items-center justify-center my-2 text-abacus-charcoal">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="1" fill="transparent" className="opacity-10" />
                  <motion.circle
                    cx="28" cy="28" r="26"
                    stroke="currentColor" strokeWidth="1" fill="transparent"
                    strokeDasharray="163.4"
                    animate={{ strokeDashoffset: 163.4 - (163.4 * (countdown / 5)) }}
                    transition={{ duration: 0.8 }}
                  />
                </svg>
                <span className="text-lg font-light">{countdown}</span>
              </div>

              <p className="text-[9px] font-mono text-gray-400 uppercase tracking-[0.3em]">
                Returning to Lobby
              </p>

              <button
                onClick={() => router.push('/lobby')}
                className="mt-4 px-8 py-3 border border-gray-200 rounded-full text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all"
                style={{ fontFamily: 'var(--font-headline)', fontWeight: 600 }}
              >
                Return Now
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
