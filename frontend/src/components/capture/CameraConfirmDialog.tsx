"use client";

import { Button } from "@/components/ui/Button";
import type { CaptureGuide } from "./MediaCapture";

type Props = {
  guide?: CaptureGuide;
  onConfirm: () => void;
  onCancel: () => void;
};

// カメラ起動前の確認ポップアップ。ブラウザの権限ダイアログが突然出ないよう事前に案内する
export function CameraConfirmDialog({ guide, onConfirm, onCancel }: Props) {
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
            カメラが起動します
          </h2>
          {guide && (
            <div className="text-sm text-ink-muted">
              <p className="font-bold text-ink-dark">{guide.title}</p>
              {guide.hints.map(h => <p key={h}>・{h}</p>)}
            </div>
          )}
          <p className="text-xs text-ink-muted">
            ブラウザからカメラの使用許可を求められたら「許可」を選んでください。
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <Button type="button" onClick={onCancel}>キャンセル</Button>
          <Button type="button" variant="primary" onClick={onConfirm} autoFocus>
            カメラを起動
          </Button>
        </div>
      </div>
    </div>
  );
}
