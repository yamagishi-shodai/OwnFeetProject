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
      `「${dog.name}」を削除しますか？\n採寸セッション ${dog.sessionCount} 件もすべて削除され、元に戻せません。`
    );
    if (ok) onDelete?.(dog.id);
  }

  return (
    <Card className="flex gap-4 items-center">
      {/* サムネイル（横長） */}
      <div className="w-36 aspect-[4/3] shrink-0 rounded-xl overflow-hidden bg-warm-gutter flex items-center justify-center">
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
      <div className="flex flex-col gap-3 flex-1">
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

        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-accent-red hover:underline self-end"
          >
            削除
          </button>
        )}
      </div>
    </Card>
  );
}
