import { DogSide, DogTop } from "@/components/illustrations/DogSilhouette";
import { VIEW_LABELS } from "@/types";
import type { ViewType } from "@/types";

// 未撮影のビューに表示するデフォルト画像（犬の外形）
export function DefaultViewImage({ viewType }: { viewType: ViewType }) {
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-xs font-bold text-ink-muted">{VIEW_LABELS[viewType]}</figcaption>
      <div className="aspect-[4/3] rounded-xl border-2 border-dashed border-border-default bg-warm-sub flex flex-col items-center justify-center gap-2">
        <svg viewBox="0 0 90 60" className="w-2/3 max-w-xs" aria-hidden>
          {viewType === "top"
            ? <DogTop x={10} y={5} className="fill-border-default text-border-default" />
            : <DogSide x={10} y={3} className="fill-border-default text-border-default" />}
        </svg>
        <p className="text-xs text-ink-light">まだ撮影されていません</p>
      </div>
    </figure>
  );
}
