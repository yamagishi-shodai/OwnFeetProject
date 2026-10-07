"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type SessionHistoryItem = {
  id: string;
  dog_id: string;
  dog_name: string;
  created_at: string;
  pixels_per_cm: number | null;
};

const SESSION_HISTORY_LIMIT = 50;

export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    setLoading(true);
    const { data, error } = await supabase
      .from("measurement_sessions")
      .select("id, dog_id, created_at, pixels_per_cm, dogs(name)")
      .order("created_at", { ascending: false })
      .limit(SESSION_HISTORY_LIMIT);

    if (error) {
      setError(error.message);
    } else {
      setSessions(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data ?? []).map((s: any) => ({
          id: s.id,
          dog_id: s.dog_id,
          dog_name: s.dogs?.name ?? "—",
          created_at: s.created_at,
          pixels_per_cm: s.pixels_per_cm,
        }))
      );
    }
    setLoading(false);
  }

  async function deleteSession(id: string): Promise<{ error: string | null }> {
    const { error: deleteErr } = await supabase.from("measurement_sessions").delete().eq("id", id);
    if (deleteErr) return { error: deleteErr.message };
    setSessions((prev) => prev.filter((s) => s.id !== id));
    return { error: null };
  }

  return { sessions, loading, error, refetch: fetchSessions, deleteSession };
}
