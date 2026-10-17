"use client";

import { Suspense, useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { use3DSession } from "@/hooks/use3DSession";
import { ViewCanvas, type CalibPoint } from "@/components/measurement/ViewCanvas";
import { Keypoint3DList, PRESET_LABELS } from "@/components/measurement/Keypoint3DList";
import { keypointStatus, isSideOnly, SIDE_ONLY_LABELS } from "@/lib/coords-3d";
import { VIEW_LABELS } from "@/types";
import type { ViewType } from "@/types";

const VIEW_ORDER: ViewType[] = ["side_left", "top"];

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">読み込み中…</p>}>
      <ViewSettingsPage />
    </Suspense>
  );
}

// カルテの写真から開く設定ページ: スケール設定 → 点の配置 → 決定でカルテへ戻る
function ViewSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const initialView = useSearchParams().get("view") as ViewType | null;
  const [calibPoints, setCalibPoints] = useState<CalibPoint[]>([]);
  // 基準物の長さ。入力途中（空欄など）でも壊れないよう文字列で持ち、使うときに数値化する
  const [knownCmText, setKnownCmText] = useState("");
  // 真上ビューの犬の向き: "left"=頭が画像左(デフォルト), "right"=頭が画像右
  const [topHeadDir, setTopHeadDir] = useState<"left" | "right">("left");

  const {
    views, keypoints, clicks, activeView,
    selectedLabel, dogId, loading, saving, error, savedFlash,
    calibrateView, resetScale, placeClick, deleteKeypoint,
    setActiveView, setLabel,
  } = use3DSession(id, initialView ?? undefined);

  const karteHref = dogId ? `/dogs/${dogId}?session=${id}` : "/dogs";
  // 同じビューが複数ある（撮り直し）場合は新しいものを使う（カルテと揃える）
  const latestView = (vt: ViewType) => [...views].reverse().find(v => v.view_type === vt && v.image_url);

  // ビューが変わったらキャリブ点をリセット
  useEffect(() => {
    setCalibPoints([]);
    setKnownCmText("");
  }, [activeView?.id]);

  const knownCm = parseFloat(knownCmText);
  const knownCmValid = Number.isFinite(knownCm) && knownCm > 0;

  if (loading) return <p className="p-8 text-sm text-ink-muted">読み込み中…</p>;

  const confirmedCount = keypoints.filter(k => keypointStatus(k).complete).length;
  // 真上ビューでは側面のみの部位（喉元・胸部・胸骨下部・尻）は置けない
  const isTopView = activeView?.view_type === "top";

  function handleCanvasClick(pixelX: number, pixelY: number, imgW: number, imgH: number) {
    if (!activeView) return;
    if (!activeView.pixels_per_cm) {
      // キャリブレーションモード: 2点を蓄積
      setCalibPoints(prev => prev.length < 2 ? [...prev, { x: pixelX, y: pixelY }] : prev);
    } else {
      if (isTopView && isSideOnly(selectedLabel)) return;
      placeClick(activeView.id, pixelX, pixelY, imgW, imgH, topAxisFlip());
      goNextLabel(); // 次の部位ラベルへ自動で進む
    }
  }

  // 真上ビューで頭が右向きのときは左右が逆に写る（頭が画像の右、犬の右側が画像の下）ので、X・Y とも反転しない
  function topAxisFlip() {
    return activeView?.view_type === "top" && topHeadDir === "right"
      ? { px_inverted: false, py_inverted: false }
      : undefined;
  }

  // 既存の点をドラッグで移動（選択中の部位や自動送りは変えない）
  function handleKeypointMove(label: string, pixelX: number, pixelY: number, imgW: number, imgH: number) {
    if (!activeView?.pixels_per_cm) return;
    placeClick(activeView.id, pixelX, pixelY, imgW, imgH, topAxisFlip(), label);
  }

  function handleCalibPointMove(index: number, pixelX: number, pixelY: number) {
    setCalibPoints(prev => prev.map((p, i) => i === index ? { x: pixelX, y: pixelY } : p));
  }

  // 部位の順番（プリセット → 独自ラベル）
  const allLabels = [...PRESET_LABELS, ...keypoints.map(k => k.label).filter(l => !PRESET_LABELS.includes(l))]
    .filter(l => !(isTopView && isSideOnly(l)));
  const labelIdx = allLabels.indexOf(selectedLabel);

  function goPrevLabel() {
    if (labelIdx > 0) setLabel(allLabels[labelIdx - 1]);
  }

  function goNextLabel() {
    if (labelIdx >= 0 && labelIdx < allLabels.length - 1) setLabel(allLabels[labelIdx + 1]);
  }

  const placedInView = (label: string) => !!activeView && keypoints.some(k =>
    k.label === label &&
    clicks.some(c => c.view_id === activeView.id && c.keypoint_3d_id === k.id)
  );
  const selectedPlacedInView = placedInView(selectedLabel);
  // 全部位を置いた、または最後の部位まで置き終わった（見えない部位はスキップされうる）
  const allPlacedInView = allLabels.every(placedInView)
    || (labelIdx === allLabels.length - 1 && selectedPlacedInView);

  // ── ビューの決定 → 次のビュー（撮影済みなら）か、カルテへ戻る ──────────
  const activeOrder = activeView ? VIEW_ORDER.indexOf(activeView.view_type) : -1;
  const nextViewType: ViewType | undefined = activeOrder >= 0 ? VIEW_ORDER[activeOrder + 1] : undefined;
  const nextView = nextViewType ? latestView(nextViewType) : undefined;
  const decideLabel = activeView
    ? `${VIEW_LABELS[activeView.view_type]}を決定 → ${nextView && nextViewType ? VIEW_LABELS[nextViewType] + "へ" : "カルテに戻る"}`
    : "";

  function handleDecideView() {
    setLabel(allLabels[0]);
    if (nextView) setActiveView(nextView.id);
    else router.push(karteHref);
  }

  async function handleCalibConfirm() {
    if (!activeView || calibPoints.length < 2 || !knownCmValid) return;
    const dx = calibPoints[1].x - calibPoints[0].x;
    const dy = calibPoints[1].y - calibPoints[0].y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    await calibrateView(activeView.id, pixelDist, knownCm, topAxisFlip());
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
          <Link href={karteHref} className="text-xs text-ink-muted hover:text-ink-primary">
            ← カルテに戻る
          </Link>
          <h1 className="text-lg font-bold text-ink-primary">
            {activeView ? `${VIEW_LABELS[activeView.view_type]}の点を設定` : "点の設定"}
          </h1>
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

        <span className="text-xs text-ink-muted">
          {confirmedCount} / {keypoints.length} ポイント確定
        </span>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-accent-red/10 text-sm text-accent-red">{error}</div>
      )}

      {/* ── 配置 ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">

          {/* 左: ビュー切り替え + キャンバス */}
          <div className="flex flex-col gap-3">
            {/* ビュータブ */}
            <div className="flex gap-1.5 flex-wrap">
              {VIEW_ORDER.map(vt => {
                const v = latestView(vt);
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
              {activeView?.pixels_per_cm && (
                <button
                  onClick={() => resetScale(activeView.id)}
                  disabled={saving}
                  className="ml-auto px-3 py-1.5 rounded-xl text-xs font-bold text-accent-red hover:bg-accent-red/10 disabled:opacity-40"
                >
                  スケールを再設定
                </button>
              )}
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

            {/* 次にクリックする場所の案内 */}
            {activeView && isCalibMode && (
              <ClickPrompt
                tone="calib"
                step={`スケール ${Math.min(calibPoints.length + 1, 2)} / 2`}
                title={
                  calibPoints.length === 0 ? <>基準物の<Em tone="calib">一端（点A）</Em>をクリック</>
                  : calibPoints.length === 1 ? <>基準物の<Em tone="calib">もう一端（点B）</Em>をクリック</>
                  : <>下のパネルで<Em tone="calib">長さ</Em>を入力して確定</>
                }
                onBack={calibPoints.length > 0 ? () => setCalibPoints(prev => prev.slice(0, -1)) : undefined}
              />
            )}
            {activeView && !isCalibMode && labelIdx < 0 && isTopView && isSideOnly(selectedLabel) && (
              <ClickPrompt
                tone="keypoint"
                step="真上ビュー"
                title={<><Em tone="keypoint">{selectedLabel}</Em>は側面の写真でのみ配置します</>}
                sub="右の一覧から別の部位を選んでください"
                onSkip={() => setLabel(allLabels[0])}
              />
            )}
            {activeView && !isCalibMode && labelIdx >= 0 && (
              <ClickPrompt
                tone={allPlacedInView ? "done" : "keypoint"}
                step={allPlacedInView ? "すべて配置済み" : `${labelIdx + 1} / ${allLabels.length}`}
                title={allPlacedInView
                  ? <>クリックし直すと位置を修正できます</>
                  : <><Em tone="keypoint">{selectedLabel}</Em>の位置をクリック</>}
                sub={allPlacedInView
                  ? `選択中: ${selectedLabel} ・ 点はドラッグでも移動できます`
                  : selectedPlacedInView ? "配置済み — 点をドラッグするか、クリックし直すと位置を修正できます" : undefined}
                onBack={labelIdx > 0 ? goPrevLabel : undefined}
                onSkip={labelIdx < allLabels.length - 1 ? goNextLabel : undefined}
                action={allPlacedInView ? { label: decideLabel, onClick: handleDecideView, disabled: saving } : undefined}
              />
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
                  onKeypointMove={handleKeypointMove}
                  onCalibPointMove={handleCalibPointMove}
                  onKeypointSelect={setLabel}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
                  カルテから画像を撮影してください
                </div>
              )}

              {/* キャリブレーション確定パネル（2点打ち終わったら出現） */}
              {isCalibMode && calibPoints.length === 2 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-72
                  bg-white rounded-2xl shadow-lg border border-border-default p-4 flex flex-col gap-3">
                  <p className="text-xs font-bold text-ink-primary">基準物の長さ（点A〜点B）を入力</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={knownCmText}
                      onChange={e => setKnownCmText(e.target.value)}
                      placeholder="例: 30"
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
                      disabled={saving || !knownCmValid}
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
                  <p>基準物の両端2点をクリック → 長さを入力 → 確定</p>
                  <p>設定後、自動的にキーポイント配置モードに切り替わります</p>
                </>
              ) : (
                <>
                  <p>① 部位を選択 → 画像上をクリックで点を配置</p>
                  <p>② 左側面ビュー → X(体長)・Z(高さ) 確定</p>
                  <p>③ 真上ビュー → X(体長)・Y(体幅) 確定</p>
                  <p>④ 「決定」でカルテに戻ると、3Dビューに反映されます</p>
                </>
              )}
            </div>
          </div>

          {/* 右パネル */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: "min(74vh, 900px)" }}>

            {/* スケール未設定（初回）でも部位を先に選んでおける */}
            <section>
              {isCalibMode && (
                <p className="text-[11px] text-accent-yellow font-bold mb-2">
                  スケール設定後、選んだ部位から配置を始めます
                </p>
              )}
              <Keypoint3DList
                keypoints={keypoints}
                selectedLabel={selectedLabel}
                onSelectLabel={setLabel}
                onDelete={deleteKeypoint}
                disabledLabels={isTopView ? SIDE_ONLY_LABELS : []}
              />
            </section>
          </div>
        </div>
    </div>
  );
}

// ── クリック案内バナー ──────────────────────────────────────────
type PromptTone = "calib" | "keypoint" | "done";

const PROMPT_BORDER: Record<PromptTone, string> = {
  calib:    "border-accent-yellow",
  keypoint: "border-accent-red",
  done:     "border-accent-green",
};

function Em({ tone, children }: { tone: PromptTone; children: React.ReactNode }) {
  return (
    <span className={`mx-1 px-2.5 py-0.5 rounded-lg text-white ${tone === "calib" ? "bg-accent-yellow" : "bg-accent-red"}`}>
      {children}
    </span>
  );
}

function ClickPrompt({ tone, step, title, sub, onBack, onSkip, action }: {
  tone: PromptTone;
  step: string;
  title: React.ReactNode;
  sub?: string;
  onBack?: () => void;
  onSkip?: () => void;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const navBtn = "shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-warm-sub text-ink-dark hover:bg-warm-main disabled:opacity-30 disabled:cursor-not-allowed";
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 border-2
      ${PROMPT_BORDER[tone]}`}>
        <button type="button" onClick={onBack} disabled={!onBack} className={navBtn}>
          ← 戻る
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[11px] font-bold text-ink-muted">{step}</p>
          <p className="text-base sm:text-lg font-bold text-ink-dark leading-snug">{title}</p>
          {sub && <p className="text-[11px] text-ink-muted mt-0.5">{sub}</p>}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="mt-2 px-5 py-2 rounded-full bg-accent-green text-white text-sm font-bold shadow-sm hover:opacity-90 disabled:opacity-40"
            >
              {action.label}
            </button>
          )}
        </div>
        {tone !== "calib" ? (
          <button type="button" onClick={onSkip} disabled={!onSkip} className={navBtn}>
            スキップ →
          </button>
        ) : <span className="w-[72px] shrink-0" />}
    </div>
  );
}
