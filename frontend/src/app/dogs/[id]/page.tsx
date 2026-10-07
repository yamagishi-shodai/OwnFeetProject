"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { linkButtonClass } from "@/components/ui/Button";
import { keypointStatus } from "@/lib/coords-3d";
import type { Dog, Keypoint3D, MeasurementSession, SessionView } from "@/types";

const KeypointViewer3D = dynamic(
  () => import("@/components/measurement/KeypointViewer3D").then(m => ({ default: m.KeypointViewer3D })),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-sm text-ink-muted">3Dビューを読み込み中…</div> }
);

type SessionWithDetails = MeasurementSession & {
  session_views: Pick<SessionView, "view_type" | "image_url">[];
  keypoints_3d: Keypoint3D[];
};

export default function DogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dog, setDog] = useState<Dog | null>(null);
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: dogData }, { data: sessionsData }] = await Promise.all([
        supabase.from("dogs").select("*").eq("id", id).single(),
        supabase
          .from("measurement_sessions")
          .select("*, session_views(view_type, image_url), keypoints_3d(*)")
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

  // セッションは新しい順に並んでいるので先頭が最新
  const latestSession = sessions[0] ?? null;
  const latestSideImage = latestSession?.session_views.find(v => v.view_type === "side_right")?.image_url
    ?? latestSession?.session_views[0]?.image_url
    ?? null;
  const latestKeypoints = latestSession?.keypoints_3d ?? [];

  async function handleDeleteDog() {
    const ok = window.confirm(
      `「${dog!.name}」を削除しますか？\n採寸セッション ${sessions.length} 件もすべて削除され、元に戻せません。`
    );
    if (!ok) return;
    setDeleting(true);
    setDeleteError(null);

    const { error: sessionsErr } = await supabase.from("measurement_sessions").delete().eq("dog_id", id);
    if (sessionsErr) { setDeleteError(sessionsErr.message); setDeleting(false); return; }

    const { error: dogErr } = await supabase.from("dogs").delete().eq("id", id);
    if (dogErr) { setDeleteError(dogErr.message); setDeleting(false); return; }

    router.push("/dogs");
  }

  async function handleDeleteSession(sessionId: string) {
    const ok = window.confirm("この採寸セッションを削除しますか？元に戻せません。");
    if (!ok) return;

    const { error: deleteErr } = await supabase.from("measurement_sessions").delete().eq("id", sessionId);
    if (deleteErr) { setDeleteError(deleteErr.message); return; }

    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

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
        <div className="flex items-center gap-3 shrink-0">
          <Link href={`/sessions/new?dog_id=${dog.id}`} className={linkButtonClass("primary", "sm")}>
            ＋ 新しい採寸
          </Link>
          <button
            type="button"
            onClick={handleDeleteDog}
            disabled={deleting}
            className="text-xs text-accent-red hover:underline disabled:opacity-50"
          >
            {deleting ? "削除中…" : "犬を削除"}
          </button>
        </div>
      </div>

      {deleteError && <p className="text-sm text-accent-red">削除に失敗しました: {deleteError}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      {/* ── 最新の採寸（横からの画像 + 3Dビュー） ─────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-ink-dark">最新の採寸</h2>
          <span className="text-xs text-ink-light">{sessions.length} セッション</span>
        </div>

        {!latestSession ? (
          <Card className="text-center py-8 text-sm text-ink-muted">
            採寸データがありません
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            <Card className="p-0 overflow-hidden">
              {latestSideImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={latestSideImage}
                  alt="横からの画像"
                  className="w-full object-contain bg-warm-gutter"
                  style={{ height: "min(50vh, 420px)" }}
                />
              ) : (
                <div
                  className="w-full flex items-center justify-center text-sm text-ink-muted bg-warm-gutter"
                  style={{ height: "min(50vh, 420px)" }}
                >
                  横からの画像はまだありません
                </div>
              )}
            </Card>

            <KeypointViewer3D
              keypoints={latestKeypoints}
              selectedLabel=""
              className="w-full"
              style={{ height: "min(50vh, 420px)" }}
            />

            <Link
              href={`/sessions/${latestSession.id}/3d`}
              className={`${linkButtonClass("secondary", "sm")} self-start`}
            >
              3D採寸ページを開く
            </Link>
          </div>
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
                      {s.keypoints_3d.filter(k => keypointStatus(k).complete).length} 部位確定
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
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(s.id)}
                    className="text-xs text-accent-red hover:underline px-1"
                  >
                    削除
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
