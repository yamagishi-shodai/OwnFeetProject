"use client";

import Link from "next/link";
import { useRecentSessions } from "@/hooks/useRecentSessions";
import { Card } from "@/components/ui/Card";
import { linkButtonClass } from "@/components/ui/Button";

export function RecentActivity() {
  const { sessions, loading, error } = useRecentSessions();

  if (!loading && !error && sessions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-bold text-ink-muted">直近の活動</h2>

      {loading && <p className="text-sm text-ink-muted">読み込み中…</p>}
      {error && <p className="text-sm text-accent-red">{error}</p>}

      {!loading && !error && (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <Card key={session.id} className="flex items-center justify-between py-3 px-4">
              <div>
                <p className="text-sm font-bold text-ink-dark">{session.dog_name}</p>
                <p className="text-xs text-ink-muted">
                  {new Date(session.created_at).toLocaleDateString("ja-JP")}
                </p>
              </div>
              <Link href={`/dogs/${session.dog_id}?session=${session.id}`} className={linkButtonClass("secondary", "sm")}>
                カルテを開く
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
