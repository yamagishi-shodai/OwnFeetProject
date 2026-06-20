"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { linkButtonClass } from "@/components/ui/Button";
import type { Dog, Measurement, MeasurementSession } from "@/types";

type SessionWithMeasurements = MeasurementSession & {
  measurements: Measurement[];
};

// ラベルごとに最新値をまとめた型
type LatestByLabel = {
  label: string;
  value_cm: number;
  session_date: string;
  session_id: string;
};

export default function DogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [dog, setDog] = useState<Dog | null>(null);
  const [sessions, setSessions] = useState<SessionWithMeasurements[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: dogData }, { data: sessionsData }] = await Promise.all([
        supabase.from("dogs").select("*").eq("id", id).single(),
        supabase
          .from("measurement_sessions")
          .select("*, measurements(*)")
          .eq("dog_id", id)
          .order("created_at", { ascending: false }),
      ]);
      setDog(dogData);
      setSessions(sessionsData ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <p className="p-8 text-sm text-ink-muted">読み込み中…</p>;
  if (!dog) return <p className="p-8 text-sm text-accent-red">犬が見つかりません</p>;

  // ラベルごとの最新値を集計（セッションは新しい順に並んでいるので先勝ち）
  const latestByLabel = new Map<string, LatestByLabel>();
  for (const session of sessions) {
    for (const m of session.measurements ?? []) {
      if (!latestByLabel.has(m.label)) {
        latestByLabel.set(m.label, {
          label: m.label,
          value_cm: m.value_cm,
          session_date: session.created_at,
          session_id: session.id,
        });
      }
    }
  }
  const latestMeasurements = Array.from(latestByLabel.values());
  const totalMeasurements = sessions.reduce((n, s) => n + (s.measurements?.length ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">

      {/* ── ヘッダー ────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-dark">{dog.name}</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            {[dog.breed, dog.weight_kg ? `${dog.weight_kg} kg` : null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          {dog.notes && <p className="text-xs text-ink-light mt-1">{dog.notes}</p>}
        </div>
        <Link href={`/sessions/new?dog_id=${dog.id}`} className={linkButtonClass("primary", "sm")}>
          ＋ 新しい採寸
        </Link>
      </div>

      {/* ── 各種寸法一覧 ─────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-ink-dark">各種寸法</h2>
          <span className="text-xs text-ink-light">
            累計 {totalMeasurements} 回採寸 · {sessions.length} セッション
          </span>
        </div>

        {latestMeasurements.length === 0 ? (
          <Card className="text-center py-8 text-sm text-ink-muted">
            採寸データがありません
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default bg-warm-bg">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-ink-muted">部位</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-ink-muted">最新値</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-ink-muted">採寸日</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {latestMeasurements.map((m) => (
                  <tr key={m.label} className="border-b border-border-light last:border-0 hover:bg-warm-bg/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-ink-dark">{m.label}</td>
                    <td className="px-4 py-3 text-right font-bold text-accent-red tabular-nums text-base">
                      {m.value_cm.toFixed(1)}
                      <span className="text-xs font-normal text-ink-muted ml-1">cm</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-muted tabular-nums">
                      {new Date(m.session_date).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/sessions/${m.session_id}/3d`}
                        className="text-xs text-accent-blue hover:underline"
                      >
                        開く
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* ── セッション履歴 ────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-dark">採寸履歴</h2>
        {sessions.length === 0 ? (
          <Card className="text-center py-6 text-sm text-ink-muted">採寸記録がありません</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s, i) => (
              <Card key={s.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  {/* セッション番号（新→旧） */}
                  <span className="text-xs font-bold text-white bg-ink-muted w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                    {sessions.length - i}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink-dark">
                      {new Date(s.created_at).toLocaleDateString("ja-JP", {
                        year: "numeric", month: "long", day: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {s.measurements?.length ?? 0} 部位
                      {s.pixels_per_cm ? "" : " · スケール未設定"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link href={`/sessions/${s.id}/3d`} className={linkButtonClass("secondary", "sm")}>
                    開く
                  </Link>
                  <Link href={`/sessions/${s.id}/export`} className={linkButtonClass("secondary", "sm")}>
                    JSON
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
