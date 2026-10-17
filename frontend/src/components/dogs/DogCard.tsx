import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { linkButtonClass } from "@/components/ui/Button";
import type { DogWithSessions } from "@/hooks/useDogs";

type Props = {
  dog: DogWithSessions;
  onDelete?: (id: string) => void;
};

export function DogCard({ dog, onDelete }: Props) {
  const thumb = dog.thumbnailUrl;

  function handleDelete() {
    const ok = window.confirm(
      `「${dog.name}」を削除しますか？\nカルテ ${dog.sessionCount} 件もすべて削除され、元に戻せません。`
    );
    if (ok) onDelete?.(dog.id);
  }

  return (
    <Card className="flex gap-3 sm:gap-4 items-center">
      {/* サムネイル（横長） */}
      <div className="w-24 sm:w-36 aspect-[4/3] shrink-0 rounded-xl overflow-hidden bg-warm-gutter flex items-center justify-center">
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
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        {/* 狭い画面では名前の下にボタンを回り込ませる */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="font-bold text-ink-dark">{dog.name}</p>
            <p className="text-xs text-ink-muted mt-0.5">
              {[dog.breed, dog.weight_kg ? `${dog.weight_kg} kg` : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href={`/dogs/${dog.id}`} className={linkButtonClass("primary", "sm")}>
              カルテを開く
            </Link>
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-accent-red hover:underline"
              >
                削除
              </button>
            )}
          </div>
        </div>

        {/* カルテのサマリー */}
        {dog.sessionCount > 0 && dog.latestSession && (
          <p className="pt-2 border-t border-border-light text-xs text-ink-muted">
            カルテ {dog.sessionCount} 件 · 最新:{" "}
            {new Date(dog.latestSession.created_at).toLocaleDateString("ja-JP")}
          </p>
        )}
      </div>
    </Card>
  );
}
