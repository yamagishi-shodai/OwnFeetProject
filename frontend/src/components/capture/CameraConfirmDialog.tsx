"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { CaptureGuide } from "./MediaCapture";

type Props = {
  guide?: CaptureGuide;
  onConfirm: () => void;              // カメラで撮影する
  onPickFile: (file: File) => void;   // ライブラリ（端末内の画像）から選んだ
  onCancel: () => void;
};

// 写真を登録する前のポップアップ。撮り方の案内と、カメラで撮影するかライブラリから選ぶかを選ばせる。
// カメラを選んだときにブラウザの権限ダイアログが突然出ないよう、ここで事前に案内する
export function CameraConfirmDialog({ guide, onConfirm, onPickFile, onCancel }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-[60] bg-ink-dark/60 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-confirm-title"
        className="w-full max-w-sm rounded-2xl bg-warm-card p-6 flex flex-col gap-4 shadow-lg"
      >
        <div className="flex flex-col gap-2">
          <h2 id="camera-confirm-title" className="text-lg font-bold text-ink-dark">
            {guide?.title ?? "写真を登録します"}
          </h2>
          {guide && (
            <div className="text-sm text-ink-muted">
              {guide.hints.map(h => <p key={h}>・{h}</p>)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" variant="primary" onClick={onConfirm} autoFocus>
            カメラで撮影する
          </Button>
          <Button type="button" onClick={() => fileInputRef.current?.click()}>
            ライブラリから選ぶ
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = ""; // 同じ画像をもう一度選んでも反応するように
              if (file) onPickFile(file);
            }}
          />
          <p className="text-xs text-ink-muted">
            カメラで撮影する場合、ブラウザからカメラの使用許可を求められたら「許可」を選んでください。
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onCancel}>キャンセル</Button>
        </div>
      </div>
    </div>
  );
}
