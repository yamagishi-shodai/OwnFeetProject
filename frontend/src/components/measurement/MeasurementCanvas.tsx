"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Measurement, MeasurementMode, MeasurementSession, Point } from "@/types";

type Props = {
  session: MeasurementSession;
  measurements: Measurement[];
  mode: MeasurementMode;
  pendingFirst: Point | null;
  onCanvasClick: (point: Point) => void;
};

const COLORS = {
  calibrate: "#556E97",
  measure:   "#D16340",
  done:      "#3E6954",
};

export function MeasurementCanvas({
  session,
  measurements,
  mode,
  pendingFirst,
  onCanvasClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const scaleRef  = useRef({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });

  // ── 描画関数 ───────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imgRef.current;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    if (!W || !H) return;
    canvas.width  = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);

    // 背景
    ctx.fillStyle = "#eae4e1";
    ctx.fillRect(0, 0, W, H);

    if (img) {
      const imgAspect = img.width / img.height;
      const canvasAspect = W / H;
      let drawW: number, drawH: number, offsetX: number, offsetY: number;

      if (imgAspect > canvasAspect) {
        drawW = W; drawH = W / imgAspect;
        offsetX = 0; offsetY = (H - drawH) / 2;
      } else {
        drawH = H; drawW = H * imgAspect;
        offsetX = (W - drawW) / 2; offsetY = 0;
      }

      scaleRef.current = {
        scaleX: drawW / img.width,
        scaleY: drawH / img.height,
        offsetX,
        offsetY,
      };

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } else {
      // 画像未ロード時はプレースホルダー
      ctx.fillStyle = "#a89888";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("画像を読み込み中…", W / 2, H / 2);
    }

    // 保存済み採寸を描画
    for (const m of measurements) {
      const a = toCanvas(m.point_a);
      const b = toCanvas(m.point_b);
      drawLine(ctx, a, b, COLORS.done, 2);
      drawDot(ctx, a, COLORS.done, 5);
      drawDot(ctx, b, COLORS.done, 5);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      drawLabel(ctx, `${m.label}  ${m.value_cm.toFixed(1)} cm`, mid, COLORS.done);
    }

    // 仮の1点目
    if (pendingFirst) {
      const p = toCanvas(pendingFirst);
      const color = mode === "calibrate" ? COLORS.calibrate : COLORS.measure;
      drawDot(ctx, p, color, 7);
      drawLabel(ctx, "2点目をクリック", { x: p.x + 10, y: p.y - 10 }, color);
    }
  }, [measurements, pendingFirst, mode]);

  // draw を常に最新版に保つ ref（image onload の stale closure 対策）
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // ── 画像ロード（URL が変わった時だけ実行） ───────────────
  useEffect(() => {
    if (!session.image_url) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = session.image_url;
    img.onload = () => {
      imgRef.current = img;
      drawRef.current(); // 常に最新の draw を呼ぶ
    };
  }, [session.image_url]);

  // ── measurements / pendingFirst / mode が変わるたびに再描画 ──
  useEffect(() => { draw(); }, [draw]);

  // ── リサイズ対応 ──────────────────────────────────────────
  useEffect(() => {
    const observer = new ResizeObserver(() => drawRef.current());
    if (canvasRef.current?.parentElement) {
      observer.observe(canvasRef.current.parentElement);
    }
    return () => observer.disconnect();
  }, []);

  // ── 座標変換 ─────────────────────────────────────────────
  function toCanvas(p: Point): Point {
    const { scaleX, scaleY, offsetX, offsetY } = scaleRef.current;
    return { x: p.x * scaleX + offsetX, y: p.y * scaleY + offsetY };
  }

  function fromCanvas(canvasP: Point): Point {
    const { scaleX, scaleY, offsetX, offsetY } = scaleRef.current;
    return {
      x: (canvasP.x - offsetX) / scaleX,
      y: (canvasP.y - offsetY) / scaleY,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasP: Point = {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
    onCanvasClick(fromCanvas(canvasP));
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair rounded-2xl"
      onPointerDown={handlePointerDown}
    />
  );
}

// ── 描画ヘルパー ──────────────────────────────────────────────

function drawDot(ctx: CanvasRenderingContext2D, p: Point, color: string, r: number) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();
}

function drawLine(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width: number) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, p: Point, color: string) {
  ctx.font = "bold 13px sans-serif";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(p.x - 2, p.y - 14, w + 6, 18);
  ctx.fillStyle = color;
  ctx.fillText(text, p.x, p.y);
}
