"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadSessionView } from "@/lib/session-views";
import { keypointStatus } from "@/lib/coords-3d";
import type { Dog, Keypoint3D, MeasurementSession, SessionView, ViewClick, ViewType } from "@/types";

// マットPDF生成（印刷用）が参照する標準サイズ。セッション作成時に固定値で入れる
const STANDARD_MAT_WIDTH_CM = 84;
const STANDARD_MAT_HEIGHT_CM = 119;

type SessionRow = MeasurementSession & {
  session_views: SessionView[];
  keypoints_3d: (Keypoint3D & { view_clicks: ViewClick[] })[];
};

export type KarteSessionSummary = {
  id: string;
  created_at: string;
  confirmedCount: number;
  hasPhoto: boolean;
};

export type KarteSession = {
  id: string;
  created_at: string;
  views: SessionView[];
  keypoints: Keypoint3D[];
  clicks: ViewClick[];
};

// 新しい採寸セッションを作る（採寸開始・カルテの「新しい採寸を始める」から使う）
export async function createSession(dogId: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("measurement_sessions")
    .insert({
      dog_id: dogId,
      mat_width_cm: STANDARD_MAT_WIDTH_CM,
      mat_height_cm: STANDARD_MAT_HEIGHT_CM,
      image_url: null, pixels_per_cm: null, notes: null,
    })
    .select("id")
    .single();
  return { id: data?.id ?? null, error: error?.message ?? null };
}

async function fetchKarte(dogId: string) {
  const [{ data: dog, error: dogErr }, { data: rows, error: sessErr }] = await Promise.all([
    supabase.from("dogs").select("*").eq("id", dogId).single(),
    supabase
      .from("measurement_sessions")
      .select("*, session_views(*), keypoints_3d(*, view_clicks(*))")
      .eq("dog_id", dogId)
      .order("created_at", { ascending: false }),
  ]);
  return {
    dog: dog as Dog | null,
    rows: (rows ?? []) as SessionRow[],
    error: dogErr?.message ?? sessErr?.message ?? null,
  };
}

// 犬1頭ぶんのカルテ: 犬・セッション一覧・表示中セッションの詳細
// sessionId 未指定なら最新のセッションを表示する
export function useKarte(dogId: string, sessionId: string | null) {
  const [dog, setDog] = useState<Dog | null>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchKarte>>) => {
    setDog(r.dog);
    setRows(r.rows);
    setError(r.error);
    setLoading(false);
  }, []);

  const reload = useCallback(async () => apply(await fetchKarte(dogId)), [dogId, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchKarte(dogId).then(r => { if (!cancelled) apply(r); });
    return () => { cancelled = true; };
  }, [dogId, apply]);

  const row = (sessionId ? rows.find(r => r.id === sessionId) : rows[0]) ?? null;
  const session: KarteSession | null = row && {
    id: row.id,
    created_at: row.created_at,
    // 同じビューが複数ある（撮り直し）場合は新しいものを使う
    views: [...row.session_views].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    keypoints: row.keypoints_3d,
    clicks: row.keypoints_3d.flatMap(k => k.view_clicks),
  };

  const sessions: KarteSessionSummary[] = rows.map(r => ({
    id: r.id,
    created_at: r.created_at,
    confirmedCount: r.keypoints_3d.filter(k => keypointStatus(k).complete).length,
    hasPhoto: r.session_views.some(v => !!v.image_url),
  }));

  // 写真を追加（セッションがなければ作る）。追加先のセッション ID を返す
  async function addPhoto(viewType: ViewType, file: File): Promise<{ sessionId: string | null; error: string | null }> {
    let sid = session?.id ?? null;
    if (!sid) {
      const created = await createSession(dogId);
      if (!created.id) return { sessionId: null, error: created.error ?? "セッション作成に失敗しました" };
      sid = created.id;
    }
    const { error: upErr } = await uploadSessionView(sid, viewType, file);
    if (upErr) return { sessionId: sid, error: upErr };
    await reload();
    return { sessionId: sid, error: null };
  }

  async function deleteSession(id: string): Promise<string | null> {
    const { error: delErr } = await supabase.from("measurement_sessions").delete().eq("id", id);
    if (delErr) return delErr.message;
    await reload();
    return null;
  }

  return { dog, session, sessions, loading, error, reload, addPhoto, deleteSession };
}
