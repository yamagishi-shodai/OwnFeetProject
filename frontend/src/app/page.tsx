"use client";

import Link from "next/link";
import { useDogs, type DogWithSessions } from "@/hooks/useDogs";
import { Card } from "@/components/ui/Card";
import { linkButtonClass } from "@/components/ui/Button";

export default function HomePage() {
  const { dogs, loading, error } = useDogs();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-dark">登録済みの犬</h1>
        <Link href="/dogs/new" className={linkButtonClass("primary", "sm")}>
          ＋ 新しい犬を登録
        </Link>
      </div>

      {loading && <p className="text-sm text-ink-muted">読み込み中…</p>}
      {error && <p className="text-sm text-accent-red">{error}</p>}

      {!loading && dogs.length === 0 && (
        <Card className="text-center py-12 flex flex-col items-center gap-4">
          <p className="text-ink-muted text-sm">まだ犬が登録されていません</p>
          <Link href="/dogs/new" className={linkButtonClass("primary")}>
            最初の犬を登録する
          </Link>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {dogs.map((dog) => (
          <DogCard key={dog.id} dog={dog} />
        ))}
      </div>
    </div>
  );
}

function DogCard({ dog }: { dog: DogWithSessions }) {
  const thumb = dog.thumbnailUrl;

  return (
    <Card className="flex gap-4 items-stretch p-0 overflow-hidden">
      {/* サムネイル */}
      <div className="w-24 shrink-0 bg-warm-gutter flex items-center justify-center">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={`${dog.name}の採寸画像`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl select-none text-ink-muted">—</span>
        )}
      </div>

      {/* コンテンツ */}
      <div className="flex flex-col gap-3 flex-1 py-4 pr-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-ink-dark">{dog.name}</p>
            <p className="text-xs text-ink-muted mt-0.5">
              {[dog.breed, dog.weight_kg ? `${dog.weight_kg} kg` : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href={`/dogs/${dog.id}`} className={linkButtonClass("secondary", "sm")}>
              詳細
            </Link>
            <Link href={`/sessions/new?dog_id=${dog.id}`} className={linkButtonClass("primary", "sm")}>
              ＋ 新しい採寸
            </Link>
          </div>
        </div>

        {/* セッション履歴サマリー */}
        {dog.sessionCount > 0 && dog.latestSession && (
          <div className="flex items-center justify-between pt-2 border-t border-border-light">
            <p className="text-xs text-ink-muted">
              採寸 {dog.sessionCount} 回 · 最新:{" "}
              {new Date(dog.latestSession.created_at).toLocaleDateString("ja-JP")}
              {dog.latestSession.pixels_per_cm ? "" : " · スケール未設定"}
            </p>
            <Link
              href={`/sessions/${dog.latestSession.id}/3d`}
              className={linkButtonClass("secondary", "sm")}
            >
              続きから
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
