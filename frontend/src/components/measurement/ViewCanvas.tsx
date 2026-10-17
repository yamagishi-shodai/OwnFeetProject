"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Keypoint3D, SessionView, ViewClick } from "@/types";
import { keypointStatus, VIEW_AXIS_MAP } from "@/lib/coords-3d";

export type CalibPoint = { x: number; y: number }; // 画像ピクセル座標

type Props = {
  view: SessionView;
  keypoints: Keypoint3D[];
  clicks: ViewClick[];
  selectedLabel: string;
  calibPoints: CalibPoint[];    // キャリブレーション中の仮点 (0〜2個)
  onViewClick: (pixelX: number, pixelY: number, imgW: number, imgH: number) => void;
  // 既存の点をドラッグして離したとき（画像ピクセル座標）
  onKeypointMove: (label: string, pixelX: number, pixelY: number, imgW: number, imgH: number) => void;
  onCalibPointMove: (index: number, pixelX: number, pixelY: number) => void;
  // 既存の点をドラッグせずにクリックしたとき
  onKeypointSelect: (label: string) => void;
};

// 既存の点をつかめる距離（canvas px）と、クリックとドラッグを区別する移動量
const HIT_RADIUS = 14;
const DRAG_THRESHOLD = 4;

type DragTarget =
  | { kind: "keypoint"; keypointId: string; label: string }
  | { kind: "calib"; index: number };

type DragState = {
  target: DragTarget;
  startX: number; startY: number;   // canvas px
  moved: boolean;
  pos: CalibPoint;                   // 画像ピクセル座標
};

export function ViewCanvas({
  view, keypoints, clicks, selectedLabel, calibPoints,
  onViewClick, onKeypointMove, onCalibPointMove, onKeypointSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const scaleRef  = useRef({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, imgW: 1, imgH: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const isCalibMode = !view.pixels_per_cm;

  function pixelToCanvas(px: number, py: number) {
    const { scaleX, scaleY, offsetX, offsetY } = scaleRef.current;
    return { x: px * scaleX + offsetX, y: py * scaleY + offsetY };
  }

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

    // ── キャリブレーションモード ──────────────────────────────
    if (isCalibMode) {
      const cps = calibPoints.map((p, i) =>
        drag?.target.kind === "calib" && drag.target.index === i
          ? pixelToCanvas(drag.pos.x, drag.pos.y)
          : pixelToCanvas(p.x, p.y)
      );

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
        const { scaleX } = scaleRef.current;
        const dist = (Math.hypot(cps[1].x - cps[0].x, cps[1].y - cps[0].y) / scaleX).toFixed(0);
        const mx = (cps[0].x + cps[1].x) / 2;
        const my = (cps[0].y + cps[1].y) / 2;
        drawLabel(ctx, `${dist} px`, { x: mx + 8, y: my - 8 }, "#cfaa55");
      }

      // キャリブレーション点
      cps.forEach((cp, i) => {
        drawDot(ctx, cp, "#cfaa55", 7);
        drawLabel(ctx, i === 0 ? "点A" : "点B", { x: cp.x + 10, y: cp.y - 8 }, "#cfaa55");
      });

      return; // キャリブレーション中はキーポイント描画しない
    }

    // ── キーポイント描画モード ────────────────────────────────
    const axisMap = VIEW_AXIS_MAP[view.view_type];

    for (const kp of keypoints) {
      const click = clicks.find(c => c.view_id === view.id && c.keypoint_3d_id === kp.id);
      if (!click) continue;

      const isDragging = drag?.target.kind === "keypoint" && drag.target.keypointId === kp.id;
      const cp = isDragging
        ? pixelToCanvas(drag.pos.x, drag.pos.y)
        : pixelToCanvas(click.pixel_x, click.pixel_y);
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
  }, [view, keypoints, clicks, selectedLabel, calibPoints, isCalibMode, drag]);

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

  function eventToCanvas(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  function canvasToPixel(c: { x: number; y: number }) {
    const { scaleX, scaleY, offsetX, offsetY } = scaleRef.current;
    return { x: (c.x - offsetX) / scaleX, y: (c.y - offsetY) / scaleY };
  }

  // canvas 座標の近くにある既存の点（最も近いもの）
  function hitTest(c: { x: number; y: number }): { target: DragTarget; pos: CalibPoint } | null {
    let best: { target: DragTarget; pos: CalibPoint; d: number } | null = null;
    const consider = (target: DragTarget, pos: CalibPoint) => {
      const cp = pixelToCanvas(pos.x, pos.y);
      const d = Math.hypot(cp.x - c.x, cp.y - c.y);
      if (d <= HIT_RADIUS && (!best || d < best.d)) best = { target, pos, d };
    };
    if (isCalibMode) {
      calibPoints.forEach((p, index) => consider({ kind: "calib", index }, p));
    } else {
      for (const kp of keypoints) {
        const click = clicks.find(c => c.view_id === view.id && c.keypoint_3d_id === kp.id);
        if (click) consider({ kind: "keypoint", keypointId: kp.id, label: kp.label }, { x: click.pixel_x, y: click.pixel_y });
      }
    }
    return best;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!imgRef.current) return;
    const c = eventToCanvas(e);

    // 既存の点をつかんだらドラッグ開始
    const hit = hitTest(c);
    if (hit) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ target: hit.target, startX: c.x, startY: c.y, moved: false, pos: hit.pos });
      return;
    }

    // キャリブ2点確定済みは新しい点を受け付けない（確定ボタン待ち）
    if (isCalibMode && calibPoints.length >= 2) return;
    const { imgW, imgH } = scaleRef.current;
    const p = canvasToPixel(c);
    if (p.x < 0 || p.x > imgW || p.y < 0 || p.y > imgH) return;
    onViewClick(p.x, p.y, imgW, imgH);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = eventToCanvas(e);
    if (!drag) {
      e.currentTarget.style.cursor = hitTest(c) ? "grab" : "crosshair";
      return;
    }
    const { imgW, imgH } = scaleRef.current;
    const p = canvasToPixel(c);
    const moved = drag.moved || Math.hypot(c.x - drag.startX, c.y - drag.startY) > DRAG_THRESHOLD;
    setDrag({
      ...drag,
      moved,
      pos: { x: Math.min(Math.max(p.x, 0), imgW), y: Math.min(Math.max(p.y, 0), imgH) },
    });
  }

  function handlePointerUp() {
    if (!drag) return;
    const { imgW, imgH } = scaleRef.current;
    const { target, moved, pos } = drag;
    setDrag(null);
    if (target.kind === "keypoint") {
      if (moved) onKeypointMove(target.label, pos.x, pos.y, imgW, imgH);
      else onKeypointSelect(target.label);
    } else if (moved) {
      onCalibPointMove(target.index, pos.x, pos.y);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-2xl touch-none"
      style={{ cursor: drag ? "grabbing" : "crosshair" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
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
