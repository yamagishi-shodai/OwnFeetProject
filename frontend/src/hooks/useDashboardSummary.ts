"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type DashboardSummary = {
  dogCount: number;
  sessionCount: number;
  scaleNotSetCount: number;
};

export function useDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary();
  }, []);

  async function fetchSummary() {
    setLoading(true);
    const [dogsRes, sessionsRes, scaleNotSetRes] = await Promise.all([
      supabase.from("dogs").select("*", { count: "exact", head: true }),
      supabase.from("measurement_sessions").select("*", { count: "exact", head: true }),
      supabase
        .from("measurement_sessions")
        .select("*", { count: "exact", head: true })
        .is("pixels_per_cm", null),
    ]);

    const firstError = dogsRes.error ?? sessionsRes.error ?? scaleNotSetRes.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setSummary({
        dogCount: dogsRes.count ?? 0,
        sessionCount: sessionsRes.count ?? 0,
        scaleNotSetCount: scaleNotSetRes.count ?? 0,
      });
    }
    setLoading(false);
  }

  return { summary, loading, error, refetch: fetchSummary };
}
