"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useKarte, createSession } from "@/hooks/useKarte";
import { Card } from "@/components/ui/Card";
import { Karte } from "@/components/karte/Karte";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

// 犬のカルテページ。?session= があればそのカルテ、なければ最新のカルテを表示する
function DogKartePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sessionParam = useSearchParams().get("session");
  const { dog, session, sessions, loading, error, reload, addPhoto, replacePhoto, deleteSession, saveManualMetrics, saveWheelchairDesign } = useKarte(id, sessionParam);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <p className="p-8 text-sm text-ink-muted">読み込み中…</p>;
  if (!dog) return <p className="p-8 text-sm text-accent-red">{error ?? "犬が見つかりません"}</p>;

  async function handleNewSession() {
    setBusy(true);
    setActionError(null);
    const { id: newId, error: err } = await createSession(id);
    if (!newId) { setActionError(err ?? "セッション作成に失敗しました"); setBusy(false); return; }
    await reload();
    setBusy(false);
    router.push(`/dogs/${id}?session=${newId}`);
  }

  async function handleDeleteSession(sessionId: string) {
    if (!window.confirm("このカルテを削除しますか？元に戻せません。")) return;
    const err = await deleteSession(sessionId);
    if (err) { setActionError(err); return; }
    if (sessionId === session?.id) router.replace(`/dogs/${id}`);
  }

  async function handleDeleteDog() {
    if (!window.confirm(
      `「${dog!.name}」を削除しますか？\nカルテ ${sessions.length} 件もすべて削除され、元に戻せません。`
    )) return;
    setBusy(true);
    const { error: sessionsErr } = await supabase.from("measurement_sessions").delete().eq("dog_id", id);
    if (sessionsErr) { setActionError(sessionsErr.message); setBusy(false); return; }
    const { error: dogErr } = await supabase.from("dogs").delete().eq("id", id);
    if (dogErr) { setActionError(dogErr.message); setBusy(false); return; }
    router.push("/dogs");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">

      {/* ── ヘッダー ────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-dark">{dog.name} のカルテ</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            {session ? `採寸日: ${formatDate(session.created_at)}` : "まだ採寸がありません"}
            {session && session.id !== sessions[0]?.id && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-accent-yellow/20 text-amber-700 font-bold">過去のカルテ</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {session && (
            <>
              <Link
                href={`/dogs/${id}/print?session=${session.id}`}
                target="_blank"
                className="text-xs text-accent-blue hover:underline"
              >
                PDF出力
              </Link>
              <Link href={`/sessions/${session.id}/export`} className="text-xs text-accent-blue hover:underline">
                JSON出力
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={handleDeleteDog}
            disabled={busy}
            className="text-xs text-accent-red hover:underline disabled:opacity-50"
          >
            犬を削除
          </button>
        </div>
      </div>

      {actionError && <p className="text-sm text-accent-red">{actionError}</p>}

      <Karte
        key={session?.id ?? "empty"}
        dogId={dog.id}
        session={session}
        onAddPhoto={addPhoto}
        onReplacePhoto={replacePhoto}
        onNewSession={handleNewSession}
        onSaveManual={saveManualMetrics}
        onSaveWheelchair={saveWheelchairDesign}
        busy={busy}
      />

      {/* ── 過去のカルテ ──────────────────────────────── */}
      {sessions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-ink-dark">過去のカルテ</h2>
          <div className="flex flex-col gap-2">
            {sessions.map((s, i) => {
              const isCurrent = s.id === session?.id;
              return (
                <Card
                  key={s.id}
                  className={`flex items-center justify-between gap-4 py-3 ${isCurrent ? "ring-2 ring-accent-green/40" : ""}`}
                >
                  <Link href={`/dogs/${id}?session=${s.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs font-bold text-white bg-ink-muted w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                      {sessions.length - i}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink-dark">
                        {formatDate(s.created_at)}
                        {isCurrent && <span className="ml-2 text-xs text-accent-green">表示中</span>}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {s.confirmedCount > 0 ? `${s.confirmedCount} 部位確定` : s.hasPhoto ? "採寸中" : "未撮影"}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(s.id)}
                    className="text-xs text-accent-red hover:underline px-1 shrink-0"
                  >
                    削除
                  </button>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">読み込み中…</p>}>
      <DogKartePage />
    </Suspense>
  );
}
