"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { use3DSession } from "@/hooks/use3DSession";
import { ViewCanvas, type CalibPoint } from "@/components/measurement/ViewCanvas";
import { Keypoint3DList, PRESET_LABELS } from "@/components/measurement/Keypoint3DList";
import { ViewUploader } from "@/components/measurement/ViewUploader";
import { DogInfoForm } from "@/components/dogs/DogInfoForm";
import { VIEW_LABELS } from "@/types";
import type { ViewType, Keypoint3D, SessionView } from "@/types";

const KeypointViewer3D = dynamic(
  () => import("@/components/measurement/KeypointViewer3D").then(m => ({ default: m.KeypointViewer3D })),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-sm text-ink-muted">3Dビューを読み込み中…</div> }
);

const VIEW_ORDER: ViewType[] = ["side_right", "top"];
type PanelMode = "place" | "view3d";

export default function ThreeDPage() {
  const { id } = useParams<{ id: string }>();
  const [panelMode, setPanelMode] = useState<PanelMode>("place");
  const [calibPoints, setCalibPoints] = useState<CalibPoint[]>([]);
  const [knownCm, setKnownCm] = useState<number | null>(null);
  // 真上ビューの犬の向き: "left"=頭が画像左(デフォルト), "right"=頭が画像右
  const [topHeadDir, setTopHeadDir] = useState<"left" | "right">("left");

  const {
    views, keypoints, clicks, activeView,
    selectedLabel, dogId, matWidthCm, loading, saving, error, savedFlash,
    addView, calibrateView, resetScale, placeClick, deleteKeypoint,
    setActiveView, setLabel,
  } = use3DSession(id);

  // ビューが変わったらキャリブ点をリセット
  useEffect(() => {
    setCalibPoints([]);
    setKnownCm(null);
  }, [activeView?.id]);

  // matWidthCm がロードされたら knownCm に初期値を入れる
  useEffect(() => {
    if (matWidthCm && knownCm === null) setKnownCm(matWidthCm);
  }, [matWidthCm, knownCm]);

  if (loading) return <p className="p-8 text-sm text-ink-muted">読み込み中…</p>;

  const confirmedCount = keypoints.filter(
    k => k.x_cm != null && k.y_cm != null && k.z_cm != null
  ).length;

  function handleCanvasClick(pixelX: number, pixelY: number, imgW: number, imgH: number) {
    if (!activeView) return;
    if (!activeView.pixels_per_cm) {
      // キャリブレーションモード: 2点を蓄積
      setCalibPoints(prev => prev.length < 2 ? [...prev, { x: pixelX, y: pixelY }] : prev);
    } else {
      // キーポイント配置モード（向き設定を反映）
      const axisFlip = (activeView.view_type === "top" && topHeadDir === "right")
        ? { px_inverted: false }
        : undefined;
      placeClick(activeView.id, pixelX, pixelY, imgW, imgH, axisFlip);

      // 次の部位ラベルへ自動で進む
      const allLabels = [...PRESET_LABELS, ...keypoints.map(k => k.label).filter(l => !PRESET_LABELS.includes(l))];
      const idx = allLabels.indexOf(selectedLabel);
      if (idx >= 0 && idx < allLabels.length - 1) {
        setLabel(allLabels[idx + 1]);
      }
    }
  }

  async function handleCalibConfirm() {
    if (!activeView || calibPoints.length < 2 || !knownCm) return;
    const dx = calibPoints[1].x - calibPoints[0].x;
    const dy = calibPoints[1].y - calibPoints[0].y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    await calibrateView(activeView.id, pixelDist, knownCm);
    setCalibPoints([]);
  }

  function handleCalibReset() {
    setCalibPoints([]);
  }

  const isCalibMode = activeView && !activeView.pixels_per_cm;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 flex flex-col gap-4">

      {/* ── ヘッダー ──────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-ink-muted hover:text-ink-primary">
            ← 犬一覧
          </Link>
          <h1 className="text-lg font-bold text-ink-primary">3D採寸</h1>
          {savedFlash && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-accent-green text-white animate-pulse">
              保存済み
            </span>
          )}
          {saving && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-warm-main text-ink-muted">
              保存中…
            </span>
          )}
        </div>

        <div className="flex rounded-xl overflow-hidden border border-border-default">
          <button
            onClick={() => setPanelMode("place")}
            className={`px-4 py-2 text-xs font-bold transition-colors
              ${panelMode === "place" ? "bg-ink-primary text-white" : "bg-warm-card text-ink-muted hover:bg-warm-sub"}`}
          >
            点を配置
          </button>
          <button
            onClick={() => setPanelMode("view3d")}
            className={`px-4 py-2 text-xs font-bold transition-colors flex items-center gap-1.5
              ${panelMode === "view3d" ? "bg-ink-primary text-white" : "bg-warm-card text-ink-muted hover:bg-warm-sub"}`}
          >
            3Dビュー
            {confirmedCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
                ${panelMode === "view3d" ? "bg-white/20" : "bg-accent-green/20 text-accent-green"}`}>
                {confirmedCount}
              </span>
            )}
          </button>
        </div>

        <span className="text-xs text-ink-muted">
          {confirmedCount} / {keypoints.length} ポイント確定
        </span>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-accent-red/10 text-sm text-accent-red">{error}</div>
      )}

      {/* ── 3Dビューモード ─────────────────────────── */}
      {panelMode === "view3d" && (
        <View3DPanel
          keypoints={keypoints}
          selectedLabel={selectedLabel}
          views={views}
          onSelectLabel={setLabel}
          onDelete={deleteKeypoint}
        />
      )}

      {/* ── 配置モード ─────────────────────────────── */}
      {panelMode === "place" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">

          {/* 左: ビュー切り替え + キャンバス */}
          <div className="flex flex-col gap-3">
            {/* ビュータブ */}
            <div className="flex gap-1.5 flex-wrap">
              {VIEW_ORDER.map(vt => {
                const v = views.find(v => v.view_type === vt);
                const isActive = activeView?.view_type === vt;
                return (
                  <button
                    key={vt}
                    onClick={() => v && setActiveView(v.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors
                      ${!v ? "opacity-40 cursor-not-allowed bg-border-default text-ink-muted"
                        : isActive ? "bg-ink-primary text-white"
                        : "bg-warm-card text-ink-muted hover:bg-warm-sub"
                      }`}
                  >
                    {VIEW_LABELS[vt]}
                    {v?.pixels_per_cm
                      ? <span className="ml-1 text-accent-green opacity-80">✓</span>
                      : v ? <span className="ml-1 opacity-60">要設定</span> : null
                    }
                  </button>
                );
              })}
            </div>

            {/* 真上ビューの向き設定 */}
            {activeView?.view_type === "top" && activeView.pixels_per_cm && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs text-ink-muted">真上ビューで犬の頭の向き:</span>
                <div className="flex rounded-lg overflow-hidden border border-border-default">
                  {(["left", "right"] as const).map(dir => (
                    <button
                      key={dir}
                      onClick={() => setTopHeadDir(dir)}
                      className={`px-3 py-1 text-xs font-bold transition-colors
                        ${topHeadDir === dir ? "bg-ink-primary text-white" : "bg-warm-card text-ink-muted hover:bg-warm-sub"}`}
                    >
                      {dir === "left" ? "← 左" : "→ 右"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* キャンバス */}
            <div className="relative rounded-2xl overflow-hidden bg-warm-gutter" style={{ height: "min(74vh, 900px)" }}>
              {activeView ? (
                <ViewCanvas
                  view={activeView}
                  keypoints={keypoints}
                  clicks={clicks}
                  selectedLabel={selectedLabel}
                  calibPoints={calibPoints}
                  onViewClick={handleCanvasClick}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
                  右パネルから画像をアップロードしてください
                </div>
              )}

              {/* キャリブレーション確定パネル（2点打ち終わったら出現） */}
              {isCalibMode && calibPoints.length === 2 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-72
                  bg-white rounded-2xl shadow-lg border border-border-default p-4 flex flex-col gap-3">
                  <p className="text-xs font-bold text-ink-primary">2点間の距離を入力</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={knownCm ?? ""}
                      onChange={e => setKnownCm(parseFloat(e.target.value))}
                      min="0.1"
                      step="0.5"
                      className="w-24 px-3 py-2 rounded-xl border border-border-default text-sm text-center font-bold"
                    />
                    <span className="text-sm text-ink-muted">cm</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCalibReset}
                      className="flex-1 py-2 rounded-xl border border-border-default text-xs font-bold text-ink-muted hover:bg-warm-sub"
                    >
                      やり直し
                    </button>
                    <button
                      onClick={handleCalibConfirm}
                      disabled={saving || !knownCm}
                      className="flex-1 py-2 rounded-xl bg-accent-yellow text-white text-xs font-bold disabled:opacity-50"
                    >
                      {saving ? "保存中…" : "スケール確定"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 使い方ガイド */}
            <div className="rounded-2xl bg-warm-card border border-border-default p-3 text-xs text-ink-muted space-y-0.5">
              {isCalibMode ? (
                <>
                  <p className="font-bold text-accent-yellow">スケール設定モード</p>
                  <p>ARマット上の2点をクリック → 距離を入力 → 確定</p>
                  <p>設定後、自動的にキーポイント配置モードに切り替わります</p>
                </>
              ) : (
                <>
                  <p>① 部位を選択 → 画像上をクリックで点を配置</p>
                  <p>② 右側面ビュー → X(体長)・Z(高さ) 確定</p>
                  <p>③ 真上ビュー → X(体長)・Y(体幅) 確定</p>
                  <p>④ 「3Dビュー」タブで確認・回転・ズーム</p>
                </>
              )}
            </div>
          </div>

          {/* 右パネル */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: "min(74vh, 900px)" }}>

            {/* 犬の情報 */}
            {dogId && (
              <section>
                <p className="text-xs font-bold text-ink-muted mb-2">犬の情報</p>
                <div className="rounded-2xl bg-warm-card border border-border-default p-3">
                  <DogInfoForm dogId={dogId} />
                </div>
              </section>
            )}

            <section>
              <p className="text-xs font-bold text-ink-muted mb-2">ビュー管理</p>
              <div className="flex flex-col gap-2">
                {VIEW_ORDER.map(vt => {
                  const v = views.find(v => v.view_type === vt);
                  return (
                    <ViewUploader
                      key={vt}
                      viewType={vt}
                      existingView={v}
                      onUpload={addView}
                      onResetScale={resetScale}
                      saving={saving}
                    />
                  );
                })}
              </div>
            </section>

            {!isCalibMode && (
              <section>
                <Keypoint3DList
                  keypoints={keypoints}
                  selectedLabel={selectedLabel}
                  onSelectLabel={setLabel}
                  onDelete={deleteKeypoint}
                />
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 3Dビュー + 写真パネル ───────────────────────────────────────
function View3DPanel({
  keypoints, selectedLabel, views, onSelectLabel, onDelete,
}: {
  keypoints: Keypoint3D[];
  selectedLabel: string;
  views: SessionView[];
  onSelectLabel: (l: string) => void;
  onDelete: (id: string) => void;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>({ top: true, side_right: true });

  const toggle = (vt: string) => setVisible(prev => ({ ...prev, [vt]: !prev[vt] }));

  const photoViews = (["side_right", "top"] as const)
    .map(vt => ({ vt, view: views.find(v => v.view_type === vt) }))
    .filter(({ view }) => view?.image_url);

  return (
    <div className="flex flex-col gap-3">
      {/* 写真の表示/非表示トグル */}
      {photoViews.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-ink-muted">写真:</span>
          {photoViews.map(({ vt, view }) => (
            <button
              key={vt}
              onClick={() => toggle(vt)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors
                ${visible[vt]
                  ? "bg-ink-primary text-white border-ink-primary"
                  : "bg-warm-card text-ink-muted border-border-default hover:bg-warm-sub"
                }`}
            >
              {VIEW_LABELS[vt]} {visible[vt] ? "非表示" : "表示"}
            </button>
          ))}
        </div>
      )}

      {/* メインレイアウト: 3D + 写真パネル */}
      <div className={`grid gap-3 ${photoViews.some(({ vt }) => visible[vt]) ? "lg:grid-cols-[1fr_260px]" : ""}`}>
        {/* 3Dビューアー */}
        <KeypointViewer3D
          keypoints={keypoints}
          selectedLabel={selectedLabel}
          className="w-full"
          style={{ height: "min(78vh, 900px)" }}
        />

        {/* 写真パネル（表示中のものだけ） */}
        {photoViews.some(({ vt }) => visible[vt]) && (
          <div className="flex flex-col gap-3">
            {photoViews.map(({ vt, view }) =>
              visible[vt] && view?.image_url ? (
                <div key={vt} className="flex flex-col gap-1">
                  <p className="text-xs font-bold text-ink-muted px-1">{VIEW_LABELS[vt]}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={view.image_url}
                    alt={VIEW_LABELS[vt]}
                    className="w-full rounded-2xl object-contain bg-warm-gutter"
                    style={{ maxHeight: 260 }}
                  />
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* キーポイントリスト */}
      <div className="rounded-2xl bg-warm-card border border-border-default p-4">
        <Keypoint3DList
          keypoints={keypoints}
          selectedLabel={selectedLabel}
          onSelectLabel={onSelectLabel}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
