"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { keypointStatus } from "@/lib/coords-3d";
import { CAPTURE_GUIDES } from "@/lib/capture-guides";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MediaCapture } from "@/components/capture/MediaCapture";
import { CameraConfirmDialog } from "@/components/capture/CameraConfirmDialog";
import { DogInfoForm } from "@/components/dogs/DogInfoForm";
import { AnnotatedViewImage } from "./AnnotatedViewImage";
import { DefaultViewImage } from "./DefaultViewImage";
import type { KarteSession } from "@/hooks/useKarte";
import type { ViewType } from "@/types";

const KeypointViewer3D = dynamic(
  () => import("@/components/measurement/KeypointViewer3D").then(m => ({ default: m.KeypointViewer3D })),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-sm text-ink-muted">3Dビューを読み込み中…</div> }
);

// カルテに並べる写真の順番（撮影順）
const KARTE_VIEW_ORDER: ViewType[] = ["side_left", "top"];

type Props = {
  dogId: string;
  session: KarteSession | null;
  onAddPhoto: (viewType: ViewType, file: File) => Promise<{ sessionId: string | null; error: string | null }>;
  onNewSession: () => void;
  busy?: boolean;
};

// 採寸カルテ: 左に点入りの写真（なければ撮影ボタン）、右に3Dビュー、下に編集できる基本情報
export function Karte({ dogId, session, onAddPhoto, onNewSession, busy }: Props) {
  const router = useRouter();
  const [confirmFor, setConfirmFor] = useState<ViewType | null>(null);
  const [captureFor, setCaptureFor] = useState<ViewType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const keypoints = session?.keypoints ?? [];
  const hasMeasurement = keypoints.some(k => keypointStatus(k).complete);

  async function handleCapture(file: File) {
    const vt = captureFor;
    setCaptureFor(null);
    if (!vt) return;
    setUploading(true);
    setUploadError(null);
    const { sessionId, error } = await onAddPhoto(vt, file);
    setUploading(false);
    if (error || !sessionId) { setUploadError(error ?? "アップロードに失敗しました"); return; }
    // 撮影したらそのビューの設定ページ（スケール設定 → 点の配置）へ
    router.push(`/sessions/${sessionId}/3d?view=${vt}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {confirmFor && (
        <CameraConfirmDialog
          guide={CAPTURE_GUIDES[confirmFor]}
          onConfirm={() => { setCaptureFor(confirmFor); setConfirmFor(null); }}
          onCancel={() => setConfirmFor(null)}
        />
      )}
      {captureFor && (
        <MediaCapture
          guide={CAPTURE_GUIDES[captureFor]}
          onCapture={handleCapture}
          onCancel={() => setCaptureFor(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 左: 写真（点と骨格入り）。未撮影ならデフォルト画像と撮影ボタン */}
        <Card className="flex flex-col gap-5">
          {KARTE_VIEW_ORDER.map(vt => {
            const view = session?.views.find(v => v.view_type === vt && v.image_url);
            return view && session ? (
              <Link
                key={vt}
                href={`/sessions/${session.id}/3d?view=${vt}`}
                className="group relative block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
              >
                <AnnotatedViewImage view={view} keypoints={keypoints} clicks={session.clicks} />
                <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-ink-dark shadow-sm
                  opacity-80 group-hover:opacity-100 transition-opacity">
                  クリックして点を設定 →
                </span>
              </Link>
            ) : (
              <div key={vt} className="flex flex-col gap-2">
                <DefaultViewImage viewType={vt} />
                <Button
                  variant="primary"
                  size="sm"
                  className="self-center"
                  onClick={() => setConfirmFor(vt)}
                  disabled={uploading || busy}
                >
                  画像を撮影する
                </Button>
              </div>
            );
          })}

          {uploading && <p className="text-xs text-ink-muted">アップロード中…</p>}
          {uploadError && <p className="text-xs text-accent-red">{uploadError}</p>}

          <div className="flex justify-end pt-1 border-t border-border-light">
            <Button size="sm" onClick={onNewSession} disabled={uploading || busy} className="mt-3">
              ＋ 新しい採寸を始める
            </Button>
          </div>
        </Card>

        {/* 右: 3Dビュー（参照点がなければ案内を表示） */}
        <div className="lg:sticky lg:top-4">
          <KeypointViewer3D
            keypoints={keypoints}
            selectedLabel=""
            className="w-full"
            style={{ height: "min(70vh, 640px)" }}
          />
          {hasMeasurement && (
            <p className="text-xs text-ink-muted text-right mt-2">
              {keypoints.filter(k => keypointStatus(k).complete).length} 部位確定
            </p>
          )}
        </div>
      </div>

      {/* 下: 犬の基本情報（その場で編集・保存） */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-dark">基本情報</h2>
        <DogInfoForm dogId={dogId} />
      </Card>
    </div>
  );
}
