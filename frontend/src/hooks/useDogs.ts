"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Dog, DogInsert, MeasurementSession } from "@/types";

export type DogWithSessions = Dog & {
  sessionCount: number;
  latestSession: Pick<MeasurementSession, "id" | "created_at" | "pixels_per_cm" | "image_url"> | null;
  thumbnailUrl: string | null;
};

export function useDogs() {
  const [dogs, setDogs] = useState<DogWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDogs();
  }, []);

  async function fetchDogs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("dogs")
      .select("*, measurement_sessions(id, created_at, pixels_per_cm, image_url, session_views(view_type, image_url))")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      const enriched: DogWithSessions[] = (data ?? []).map((d: any) => {
        const sessions = ((d.measurement_sessions ?? []) as any[]).sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latest = sessions[0] ?? null;
        const sideView = latest?.session_views?.find((v: any) => v.view_type === "side_left" || v.view_type === "side_right");
        return {
          ...d,
          sessionCount: sessions.length,
          latestSession: latest,
          thumbnailUrl: sideView?.image_url ?? latest?.image_url ?? null,
        };
      });
      setDogs(enriched);
    }
    setLoading(false);
  }

  async function createDog(input: DogInsert): Promise<{ dog: Dog | null; error: string | null }> {
    const { data, error } = await supabase
      .from("dogs")
      .insert(input)
      .select()
      .single();

    if (error) {
      console.error("[createDog]", error);
      return { dog: null, error: error.message };
    }
    setDogs((prev) => [data, ...prev]);
    return { dog: data, error: null };
  }

  async function deleteDog(id: string): Promise<{ error: string | null }> {
    // 先にこの犬の採寸セッションを削除（session_views/keypoints_3d/view_clicks は DB 側の
    // ON DELETE CASCADE で連動削除される）。それから犬本体を削除する
    const { error: sessionsErr } = await supabase
      .from("measurement_sessions")
      .delete()
      .eq("dog_id", id);
    if (sessionsErr) {
      console.error("[deleteDog] sessions", sessionsErr);
      return { error: sessionsErr.message };
    }

    const { error: dogErr } = await supabase.from("dogs").delete().eq("id", id);
    if (dogErr) {
      console.error("[deleteDog] dog", dogErr);
      return { error: dogErr.message };
    }

    setDogs((prev) => prev.filter((d) => d.id !== id));
    return { error: null };
  }

  return { dogs, loading, error, createDog, deleteDog, refetch: fetchDogs };
}
