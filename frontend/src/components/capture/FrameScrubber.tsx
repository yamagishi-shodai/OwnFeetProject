"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  source: Blob;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

// ブラウザからは正確なフレームレートを安定して取得できないため、
// 一般的な動画に近い 1/30 秒を「1コマ」の目安として前後させる
const FRAME_STEP_SEC = 1 / 30;

export function FrameScrubber({ source, onConfirm, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(source);
    const video = videoRef.current;
    if (video) video.src = url;
    return () => URL.revokeObjectURL(url);
  }, [source]);

  function drawCurrentFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    setReady(true);
    // loadedmetadata の時点ではまだ実フレームが描画できないことがあるため、
    // わずかにシークして "seeked" 経由で確実に最初のフレームを描画する
    video.currentTime = Math.min(0.001, video.duration || 0);
  }

  function seekTo(t: number) {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(duration || 0, t));
    setTime(clamped);
    video.currentTime = clamped;
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    seekTo(parseFloat(e.target.value));
  }

  function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <video
        ref={videoRef}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={drawCurrentFrame}
        className="hidden"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="w-full flex-1 min-h-0 rounded-2xl bg-black object-contain" />

      {ready ? (
        <>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={time}
            onChange={handleSeek}
            className="w-full"
          />
          {/* 1コマ単位の微調整 */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => seekTo(time - FRAME_STEP_SEC)}
              disabled={time <= 0}
              className="px-4 py-1.5 rounded-xl bg-white/10 text-white text-xs font-bold disabled:opacity-30"
            >
              ◀ 1コマ戻る
            </button>
            <span className="text-xs text-white/70 tabular-nums">{time.toFixed(2)}s / {duration.toFixed(2)}s</span>
            <button
              onClick={() => seekTo(time + FRAME_STEP_SEC)}
              disabled={time >= duration}
              className="px-4 py-1.5 rounded-xl bg-white/10 text-white text-xs font-bold disabled:opacity-30"
            >
              1コマ進む ▶
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-white/70">動画を読み込み中…</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-xl border border-white/30 text-xs font-bold text-white hover:bg-white/10"
        >
          やり直す
        </button>
        <button
          onClick={handleConfirm}
          disabled={!ready}
          className="flex-1 px-4 py-2 rounded-xl bg-accent-blue text-white text-xs font-bold disabled:opacity-50"
        >
          このフレームを使う
        </button>
      </div>
    </div>
  );
}
