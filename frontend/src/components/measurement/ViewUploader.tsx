"use client";

import { useState } from "react";
import type { SessionView, ViewType } from "@/types";
import { VIEW_LABELS } from "@/types";
import { MediaCapture } from "@/components/capture/MediaCapture";

type Props = {
  viewType: ViewType;
  existingView: SessionView | undefined;
  onUpload: (viewType: ViewType, file: File) => Promise<void>;
  onResetScale?: (viewId: string) => Promise<void>;
  saving: boolean;
};

export function ViewUploader({ viewType, existingView, onUpload, onResetScale, saving }: Props) {
  const [capturing, setCapturing] = useState(false);
  const label = VIEW_LABELS[viewType];

  async function handleCapture(file: File) {
    setCapturing(false);
    await onUpload(viewType, file);
  }

  if (capturing) {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-warm-card border border-border-default">
        <p className="text-xs font-bold text-ink-muted">{label}</p>
        <MediaCapture onCapture={handleCapture} onCancel={() => setCapturing(false)} />
      </div>
    );
  }

  if (!existingView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-5 border-2 border-dashed border-border-default rounded-2xl bg-warm-card">
        <p className="text-xs text-ink-muted font-bold">{label}</p>
        <button
          onClick={() => setCapturing(true)}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-accent-blue text-white text-xs font-bold disabled:opacity-50"
        >
          {saving ? "アップロード中…" : "画像を選択"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl bg-warm-card border border-border-default">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-ink-muted">{label}</p>
        <button
          onClick={() => setCapturing(true)}
          disabled={saving}
          className="text-xs text-accent-blue hover:underline disabled:opacity-50"
        >
          再アップロード
        </button>
      </div>

      {existingView.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={existingView.image_url} alt={label} className="w-full h-20 object-cover rounded-xl" />
      )}

      {existingView.pixels_per_cm ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-accent-green font-bold">
            ✓ {existingView.pixels_per_cm.toFixed(2)} px/cm
          </p>
          <button
            onClick={() => onResetScale?.(existingView.id)}
            disabled={saving}
            className="text-xs text-accent-red hover:underline disabled:opacity-50"
          >
            修正する
          </button>
        </div>
      ) : (
        <p className="text-xs text-accent-yellow font-bold">
          画像上の2点をクリックしてスケールを設定
        </p>
      )}
    </div>
  );
}
