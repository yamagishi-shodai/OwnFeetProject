"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { keypointStatus } from "@/lib/coords-3d";
import { adoptedValues, applyManualMetrics, type ManualMetrics, type MetricKey } from "@/lib/body-metrics";
import { CAPTURE_GUIDES } from "@/lib/capture-guides";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MediaCapture } from "@/components/capture/MediaCapture";
import { CameraConfirmDialog } from "@/components/capture/CameraConfirmDialog";
import { DogInfoForm, type DogPatch } from "@/components/dogs/DogInfoForm";
import { AnnotatedViewImage } from "./AnnotatedViewImage";
import { DefaultViewImage } from "./DefaultViewImage";
import { BodyMetricsCard } from "./BodyMetricsCard";
import type { KarteSession } from "@/hooks/useKarte";
import { VIEW_LABELS } from "@/types";
import type { ViewType } from "@/types";

const KeypointViewer3D = dynamic(
  () => import("@/components/measurement/KeypointViewer3D").then(m => ({ default: m.KeypointViewer3D })),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-sm text-ink-muted">3Dビューを読み込み中…</div> }
);

// カルテに並べる写真の順番（撮影順）
const KARTE_VIEW_ORDER: ViewType[] = ["side_left", "top"];

type Props = {
  // null = 下書き（新しいカルテ。犬もセッションもまだ DB にない）
  dogId: string | null;
  session: KarteSession | null;
  onAddPhoto: (viewType: ViewType, file: File) => Promise<{ sessionId: string | null; error: string | null }>;
  onReplacePhoto: (viewType: ViewType, file: File) => Promise<{ sessionId: string | null; error: string | null }>;
  onNewSession?: () => void;
  // 下書きで基本情報が初めて入力されたとき（犬とカルテを作る）
  onCreateDog?: (patch: DogPatch) => Promise<void>;
  onSaveManual: (sessionId: string, value: ManualMetrics) => Promise<string | null>;
  busy?: boolean;
};

// 採寸カルテ: 左に点入りの写真（なければ撮影ボタン）、右に3Dビュー、下に編集できる基本情報
export function Karte({ dogId, session, onAddPhoto, onReplacePhoto, onNewSession, onCreateDog, onSaveManual, busy }: Props) {
  const router = useRouter();
  const [confirmFor, setConfirmFor] = useState<ViewType | null>(null);
  const [captureFor, setCaptureFor] = useState<ViewType | null>(null);
  // 撮影済みの写真を撮り直す（差し替え）か、新しく撮るか
  const [replacing, setReplacing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const keypoints = session?.keypoints ?? [];
  // 実測値（手入力）と 3D への採用。Karte はセッションごとに key で作り直されるので初期値はそのセッションのもの
  const [manual, setManual] = useState<ManualMetrics>(session?.manualMetrics ?? {});
  const [manualError, setManualError] = useState<string | null>(null);
  // 3D には採用した実測値に合わせて補正した点を渡す（保存済みの座標は変えない）
  const sessionKeypoints = session?.keypoints;
  const displayKeypoints = useMemo(() => applyManualMetrics(sessionKeypoints ?? [], manual), [sessionKeypoints, manual]);
  const adoptedKeys = Object.keys(adoptedValues(manual)) as MetricKey[];

  async function handleManualChange(next: ManualMetrics) {
    setManual(next);
    if (!session) return;
    setManualError(await onSaveManual(session.id, next));
  }
  const hasMeasurement = keypoints.some(k => keypointStatus(k).complete);

  async function handleCapture(file: File) {
    const vt = captureFor;
    setCaptureFor(null);
    if (!vt) return;
    setUploading(true);
    setUploadError(null);
    const { sessionId, error } = await (replacing ? onReplacePhoto : onAddPhoto)(vt, file);
    setReplacing(false);
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
          onCancel={() => { setConfirmFor(null); setReplacing(false); }}
        />
      )}
      {captureFor && (
        <MediaCapture
          guide={CAPTURE_GUIDES[captureFor]}
          onCapture={handleCapture}
          onCancel={() => { setCaptureFor(null); setReplacing(false); }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 左: 写真（点と骨格入り）。未撮影ならデフォルト画像と撮影ボタン */}
        <Card className="flex flex-col gap-5">
          {KARTE_VIEW_ORDER.map(vt => {
            const view = session?.views.find(v => v.view_type === vt && v.image_url);
            return view && session ? (
              <div key={vt} className="flex flex-col gap-2">
                <Link
                  href={`/sessions/${session.id}/3d?view=${vt}`}
                  className="group relative block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                >
                  <AnnotatedViewImage view={view} keypoints={keypoints} clicks={session.clicks} />
                  <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-ink-dark shadow-sm
                    opacity-80 group-hover:opacity-100 transition-opacity">
                    クリックして点を設定 →
                  </span>
                </Link>
                <Button
                  size="sm"
                  className="self-end"
                  disabled={uploading || busy}
                  onClick={() => {
                    if (!window.confirm(
                      `${VIEW_LABELS[vt]}の写真を差し替えますか？\nこの写真に置いた点とスケールはリセットされ、新しい写真で設定し直します。`
                    )) return;
                    setReplacing(true);
                    setConfirmFor(vt);
                  }}
                >
                  画像を差し替える
                </Button>
              </div>
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

          {dogId && onNewSession && (
            <div className="flex justify-end pt-1 border-t border-border-light">
              <Button size="sm" onClick={onNewSession} disabled={uploading || busy} className="mt-3">
                ＋ 新しい採寸を始める
              </Button>
            </div>
          )}
        </Card>

        {/* 右: 3Dビュー（参照点がなければ案内を表示） */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4">
          <KeypointViewer3D
            keypoints={displayKeypoints}
            frameKeypoints={keypoints}
            adoptedMetrics={adoptedKeys}
            selectedLabel=""
            className="w-full"
            style={{ height: "min(70vh, 640px)" }}
          />
          {hasMeasurement && (
            <BodyMetricsCard keypoints={keypoints} manual={manual} onChange={handleManualChange} saveError={manualError} />
          )}
        </div>
      </div>

      {/* 下: 犬の基本情報（その場で編集・保存） */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-dark">基本情報</h2>
        <DogInfoForm key={dogId ?? "draft"} dogId={dogId} onCreate={onCreateDog} />
      </Card>
    </div>
  );
}
