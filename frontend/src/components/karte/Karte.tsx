"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { WheelchairDesignCard } from "./WheelchairDesignCard";
import { buildOverlayPhotos } from "@/lib/photo-overlay";
import { autoWheelchairValues, estimateWheelchair, resolveWheelchair, placeWheelchair, type WheelchairDesign } from "@/lib/wheelchair";
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
  onSaveWheelchair?: (sessionId: string, value: WheelchairDesign) => Promise<string | null>;
  busy?: boolean;
};

// 採寸カルテ: 左に点入りの写真（なければ撮影ボタン）、右に3Dビュー、下に編集できる基本情報
export function Karte({ dogId, session, onAddPhoto, onReplacePhoto, onNewSession, onCreateDog, onSaveManual, onSaveWheelchair, busy }: Props) {
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
  // 3D ビューの真横・真上で重ねる写真（位置合わせは補正前の点で行う）
  const overlayPhotos = useMemo(
    () => (session ? buildOverlayPhotos(session.views, session.clicks, session.keypoints) : {}),
    [session]
  );

  // 車椅子設計: 実測値で補正した点から自動計算し、手入力の設計値で上書きする
  const [wheelchairDesign, setWheelchairDesign] = useState<WheelchairDesign>(session?.wheelchairDesign ?? {});
  const [wheelchairError, setWheelchairError] = useState<string | null>(null);
  const wheelchairEstimated = useMemo(
    () => (hasMeasurement ? estimateWheelchair(displayKeypoints) : null),
    [hasMeasurement, displayKeypoints]
  );
  const wheelchair = useMemo(
    () => wheelchairEstimated && placeWheelchair(displayKeypoints, resolveWheelchair(wheelchairEstimated, wheelchairDesign)),
    [wheelchairEstimated, displayKeypoints, wheelchairDesign]
  );
  // 各項目の「自動」の値。車輪径・横フレーム高さは、手で変えたフレーム高さなどに合わせて計算し直した値を出す
  const wheelchairAuto = useMemo(
    () => wheelchairEstimated && autoWheelchairValues(wheelchairEstimated, wheelchairDesign),
    [wheelchairEstimated, wheelchairDesign]
  );

  // スライダーは動かすたびに変わるので、画面にはすぐ反映し、保存は止まってから少し待って1回だけ行う
  const wheelchairSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWheelchairSave = useRef<(() => void) | null>(null);
  function handleWheelchairChange(next: WheelchairDesign) {
    setWheelchairDesign(next);
    if (!session || !onSaveWheelchair) return;
    if (wheelchairSaveTimer.current) clearTimeout(wheelchairSaveTimer.current);
    const sessionId = session.id;
    pendingWheelchairSave.current = () => { onSaveWheelchair(sessionId, next).then(setWheelchairError); };
    wheelchairSaveTimer.current = setTimeout(() => {
      pendingWheelchairSave.current?.();
      pendingWheelchairSave.current = null;
    }, 600);
  }
  // 保存待ちのままページを離れても失わないよう、その場で保存する
  useEffect(() => () => {
    if (wheelchairSaveTimer.current) clearTimeout(wheelchairSaveTimer.current);
    pendingWheelchairSave.current?.();
  }, []);

  // カメラで撮影した、またはライブラリから選んだ写真を登録する
  async function handlePhoto(vt: ViewType, file: File) {
    setUploading(true);
    setUploadError(null);
    const { sessionId, error } = await (replacing ? onReplacePhoto : onAddPhoto)(vt, file);
    setReplacing(false);
    setUploading(false);
    if (error || !sessionId) { setUploadError(error ?? "アップロードに失敗しました"); return; }
    // 登録したらそのビューの設定ページ（スケール設定 → 点の配置）へ
    router.push(`/sessions/${sessionId}/3d?view=${vt}`);
  }

  function handleCapture(file: File) {
    const vt = captureFor;
    setCaptureFor(null);
    if (vt) handlePhoto(vt, file);
  }

  return (
    <div className="flex flex-col gap-4">
      {confirmFor && (
        <CameraConfirmDialog
          guide={CAPTURE_GUIDES[confirmFor]}
          onConfirm={() => { setCaptureFor(confirmFor); setConfirmFor(null); }}
          onPickFile={file => { const vt = confirmFor; setConfirmFor(null); handlePhoto(vt, file); }}
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
                  画像を登録する
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
            photos={overlayPhotos}
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

      {/* 基本情報の下: 車椅子設計 */}
      <WheelchairDesignCard
        estimated={wheelchairAuto}
        design={wheelchairDesign}
        onChange={handleWheelchairChange}
        frame={wheelchair?.frame ?? null}
        preview={
          <KeypointViewer3D
            keypoints={displayKeypoints}
            frameKeypoints={keypoints}
            adoptedMetrics={adoptedKeys}
            photos={overlayPhotos}
            wheelchair={wheelchair}
            selectedLabel=""
            className="w-full"
            style={{ height: "min(60vh, 520px)" }}
          />
        }
        saveError={wheelchairError}
      />
    </div>
  );
}
