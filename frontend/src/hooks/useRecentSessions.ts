"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type RecentSession = {
  id: string;
  dog_id: string;
  dog_name: string;
  created_at: string;
  pixels_per_cm: number | null;
};

const RECENT_SESSIONS_LIMIT = 5;

export function useRecentSessions() {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecentSessions();
  }, []);

  async function fetchRecentSessions() {
    setLoading(true);
    const { data, error } = await supabase
      .from("measurement_sessions")
      .select("id, dog_id, created_at, pixels_per_cm, dogs(name)")
      .order("created_at", { ascending: false })
      .limit(RECENT_SESSIONS_LIMIT);

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

  return { sessions, loading, error, refetch: fetchRecentSessions };
}
