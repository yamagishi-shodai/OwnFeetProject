"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// 旧 URL 互換: セッションのカルテ（/dogs/[dog_id]?session=）へ転送する
export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    supabase.from("measurement_sessions").select("dog_id").eq("id", id).single()
      .then(({ data }) => router.replace(data ? `/dogs/${data.dog_id}?session=${id}` : "/dogs"));
  }, [id, router]);

  return <p className="p-8 text-sm text-ink-muted">リダイレクト中…</p>;
}
