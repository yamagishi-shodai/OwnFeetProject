"use client";

import { useState } from "react";
import Link from "next/link";
import { useSessionHistory } from "@/hooks/useSessionHistory";
import { Card } from "@/components/ui/Card";
import { linkButtonClass } from "@/components/ui/Button";

export default function SessionHistoryPage() {
  const { sessions, loading, error, deleteSession } = useSessionHistory();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(id: string, dogName: string) {
    const ok = window.confirm(`「${dogName}」の採寸セッションを削除しますか？元に戻せません。`);
    if (!ok) return;
    setDeleteError(null);
    const { error } = await deleteSession(id);
    if (error) setDeleteError(error);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
      <h1 className="text-xl font-bold text-ink-dark">採寸履歴</h1>

      {loading && <p className="text-sm text-ink-muted">読み込み中…</p>}
      {error && <p className="text-sm text-accent-red">{error}</p>}
      {deleteError && <p className="text-sm text-accent-red">削除に失敗しました: {deleteError}</p>}

      {!loading && !error && sessions.length === 0 && (
        <Card className="text-center py-10 text-sm text-ink-muted">採寸記録がありません</Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        {sessions.map((s) => (
          <Card key={s.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink-dark">{s.dog_name}</p>
              <p className="text-xs text-ink-muted">
                {new Date(s.created_at).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                {s.pixels_per_cm ? "" : " · スケール未設定"}
              </p>
            </div>
            <div className="flex gap-2 shrink-0 items-center">
              <Link href={`/sessions/${s.id}/3d`} className={linkButtonClass("secondary", "sm")}>
                開く
              </Link>
              <Link href={`/sessions/${s.id}/export`} className={linkButtonClass("secondary", "sm")}>
                JSON
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(s.id, s.dog_name)}
                className="text-xs text-accent-red hover:underline px-1"
              >
                削除
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
