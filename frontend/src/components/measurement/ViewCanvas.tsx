"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Keypoint3D, SessionView, ViewClick } from "@/types";
import { keypointStatus, VIEW_AXIS_MAP } from "@/lib/coords-3d";
import type { NormalizedCorner } from "@/lib/aruco-api";

export type CalibPoint = { x: number; y: number }; // 画像ピクセル座標

type Props = {
  view: SessionView;
  keypoints: Keypoint3D[];
  clicks: ViewClick[];
  selectedLabel: string;
  calibPoints: CalibPoint[];    // キャリブレーション中の仮点 (0〜2個)
  onViewClick: (pixelX: number, pixelY: number, imgW: number, imgH: number) => void;
  detectedCorners?: NormalizedCorner[];
};

export function ViewCanvas({ view, keypoints, clicks, selectedLabel, calibPoints, onViewClick, detectedCorners }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const scaleRef  = useRef({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, imgW: 1, imgH: 1 });
  const isCalibMode = !view.pixels_per_cm;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    if (!W || !H) return;
    canvas.width = W; canvas.height = H;

    ctx.fillStyle = "#eae4e1";
    ctx.fillRect(0, 0, W, H);

    const img = imgRef.current;
    if (img) {
      const imgAspect = img.width / img.height;
      const canvasAspect = W / H;
      let drawW: number, drawH: number, offsetX: number, offsetY: number;
      if (imgAspect > canvasAspect) {
        drawW = W; drawH = W / imgAspect; offsetX = 0; offsetY = (H - drawH) / 2;
      } else {
        drawH = H; drawW = H * imgAspect; offsetX = (W - drawW) / 2; offsetY = 0;
      }
      scaleRef.current = {
        scaleX: drawW / img.width, scaleY: drawH / img.height,
        offsetX, offsetY, imgW: img.width, imgH: img.height,
      };
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } else {
      ctx.fillStyle = "#a89888";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("画像を読み込み中…", W / 2, H / 2);
      return;
    }

    // ── ArUco 検出オーバーレイ ────────────────────────────────
    if (detectedCorners && detectedCorners.length > 0) {
      const { imgW, imgH } = scaleRef.current;
      const pts = detectedCorners.map(c => ({
        id: c.id,
        ...pixelToCanvas(c.x * imgW, c.y * imgH),
      }));
      const byLocal = Object.fromEntries(pts.map(p => [p.id % 4, p]));
      // TL=0 → TR=1 → BR=3 → BL=2 の順で四角形
      const rectPts = [0, 1, 3, 2].map(i => byLocal[i]).filter(Boolean);
      if (rectPts.length === 4) {
        ctx.beginPath();
        ctx.moveTo(rectPts[0].x, rectPts[0].y);
        rectPts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = "rgba(62,105,84,0.10)";
        ctx.fill();
        ctx.strokeStyle = "rgba(62,105,84,0.65)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const pt of pts) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(62,105,84,0.75)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText(String(pt.id), pt.x, pt.y + 4);
        ctx.textAlign = "left";
      }
    }

    // ── キャリブレーションモード ──────────────────────────────
    if (isCalibMode) {
      const cps = calibPoints.map(p => pixelToCanvas(p.x, p.y));

      // 2点間の線
      if (cps.length === 2) {
        ctx.beginPath();
        ctx.moveTo(cps[0].x, cps[0].y);
        ctx.lineTo(cps[1].x, cps[1].y);
        ctx.strokeStyle = "#cfaa55";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // ピクセル距離ラベル
        const dx = calibPoints[1].x - calibPoints[0].x;
        const dy = calibPoints[1].y - calibPoints[0].y;
        const dist = Math.sqrt(dx * dx + dy * dy).toFixed(0);
        const mx = (cps[0].x + cps[1].x) / 2;
        const my = (cps[0].y + cps[1].y) / 2;
        drawLabel(ctx, `${dist} px`, { x: mx + 8, y: my - 8 }, "#cfaa55");
      }

      // キャリブレーション点
      cps.forEach((cp, i) => {
        drawDot(ctx, cp, "#cfaa55", 7);
        drawLabel(ctx, i === 0 ? "点A" : "点B", { x: cp.x + 10, y: cp.y - 8 }, "#cfaa55");
      });

      // ガイドメッセージ
      ctx.save();
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#cfaa55";
      ctx.textAlign = "center";
      const msg = calibPoints.length === 0
        ? "スケール設定: ARマット上の点Aをクリック"
        : calibPoints.length === 1
        ? "次に点Bをクリック（既知の距離の2点目）"
        : "下のパネルで距離を入力して確定してください";
      ctx.fillText(msg, W / 2, H - 16);
      ctx.restore();
      return; // キャリブレーション中はキーポイント描画しない
    }

    // ── キーポイント描画モード ────────────────────────────────
    const axisMap = VIEW_AXIS_MAP[view.view_type];

    for (const kp of keypoints) {
      const click = clicks.find(c => c.view_id === view.id && c.keypoint_3d_id === kp.id);
      if (!click) continue;

      const cp = pixelToCanvas(click.pixel_x, click.pixel_y);
      const status = keypointStatus(kp);
      const isSelected = kp.label === selectedLabel;
      const color = isSelected ? "#D16340" : "#3E6954";

      drawDot(ctx, cp, color, isSelected ? 8 : 6);

      const axisX = axisMap.px_axis.replace("_cm", "").toUpperCase();
      const axisY = axisMap.py_axis.replace("_cm", "").toUpperCase();
      drawLabel(ctx, `${kp.label} [${axisX}${axisY}]`, { x: cp.x + 10, y: cp.y - 8 }, color);

      if (status.complete) {
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = "#3E6954";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const hasClick = keypoints.some(k =>
      k.label === selectedLabel &&
      clicks.some(c => c.view_id === view.id && c.keypoint_3d_id === k.id)
    );
    if (!hasClick) {
      ctx.save();
      ctx.font = "bold 12px sans-serif";
      ctx.fillStyle = "#D16340";
      ctx.textAlign = "center";
      ctx.fillText(`「${selectedLabel}」の位置をクリック`, W / 2, H - 16);
      ctx.restore();
    }
  }, [view, keypoints, clicks, selectedLabel, calibPoints, isCalibMode, detectedCorners]);

  function pixelToCanvas(px: number, py: number) {
    const { scaleX, scaleY, offsetX, offsetY } = scaleRef.current;
    return { x: px * scaleX + offsetX, y: py * scaleY + offsetY };
  }

  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  useEffect(() => {
    if (!view.image_url) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = view.image_url;
    img.onload = () => { imgRef.current = img; drawRef.current(); };
  }, [view.image_url]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const observer = new ResizeObserver(() => drawRef.current());
    if (canvasRef.current?.parentElement) observer.observe(canvasRef.current.parentElement);
    return () => observer.disconnect();
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    // キャリブ2点確定済みは受け付けない（確定ボタン待ち）
    if (isCalibMode && calibPoints.length >= 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const { scaleX, scaleY, offsetX, offsetY, imgW, imgH } = scaleRef.current;
    const pixelX = (canvasX - offsetX) / scaleX;
    const pixelY = (canvasY - offsetY) / scaleY;
    if (pixelX < 0 || pixelX > imgW || pixelY < 0 || pixelY > imgH) return;
    onViewClick(pixelX, pixelY, imgW, imgH);
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-2xl cursor-crosshair"
      onPointerDown={handlePointerDown}
    />
  );
}

function drawDot(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, color: string, r: number) {
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, p: { x: number; y: number }, color: string) {
  ctx.font = "bold 12px sans-serif";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(p.x - 2, p.y - 13, w + 6, 17);
  ctx.fillStyle = color;
  ctx.fillText(text, p.x, p.y);
}
