"use client";

import { useEffect, useRef, useState } from "react";
import { FrameScrubber } from "./FrameScrubber";

type Mode = "live" | "scrub";

export type CaptureGuide = {
  title: string;
  hints: string[];
  // 画像上で犬の頭が来るべき側。指定するとカメラ映像の端に矢印を表示する
  headSide?: "left" | "right";
};

type Props = {
  onCapture: (file: File) => void;
  onCancel?: () => void;
  guide?: CaptureGuide;
};

export function MediaCapture({ onCapture, onCancel, guide }: Props) {
  const [mode, setMode] = useState<Mode>("live");
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<Blob | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // マウントしたら即座にカメラを起動する（ユーザーに事前のモード選択をさせない）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStarting(true);
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (!cancelled) setError("カメラを起動できませんでした。ファイルを選択してください");
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, []);

  function handleShutter() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  function handleRecordToggle() {
    if (!recording) {
      const stream = streamRef.current;
      if (!stream) return;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        stopCamera();
        setPendingVideo(blob);
        setMode("scrub");
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } else {
      recorderRef.current?.stop();
      setRecording(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type.startsWith("video/")) {
      stopCamera();
      setPendingVideo(file);
      setMode("scrub");
    } else {
      stopCamera();
      onCapture(file);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-ink-dark/95 flex items-center justify-center p-3">
      <div className="w-full h-full max-w-[1600px] flex flex-col gap-3">
        {mode === "scrub" && pendingVideo ? (
          <FrameScrubber
            source={pendingVideo}
            onConfirm={(file) => { setPendingVideo(null); onCapture(file); }}
            onCancel={() => { setPendingVideo(null); setMode("live"); }}
          />
        ) : (
          <>
            <div className="relative w-full flex-1 min-h-0 rounded-2xl overflow-hidden bg-black">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
              {guide && (
                <>
                  <div className="absolute top-3 left-3 right-3 flex justify-center pointer-events-none">
                    <div className="rounded-xl bg-black/60 px-4 py-2 text-center text-white">
                      <p className="text-sm font-bold">{guide.title}</p>
                      {guide.hints.map((h) => (
                        <p key={h} className="text-xs text-white/80">{h}</p>
                      ))}
                    </div>
                  </div>
                  {guide.headSide && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 ${guide.headSide === "left" ? "left-3" : "right-3"}
                        rounded-xl bg-black/60 px-3 py-2 text-sm font-bold text-white pointer-events-none`}
                    >
                      {guide.headSide === "left" ? "← 頭" : "頭 →"}
                    </div>
                  )}
                </>
              )}
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white/80">
                  カメラを起動しています…
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {error && <p className="text-xs text-accent-red bg-white rounded-xl px-3 py-2">{error}</p>}

            {!error && !starting && (
              <div className="flex gap-3">
                <button
                  onClick={handleShutter}
                  disabled={recording}
                  className="flex-1 px-4 py-3 rounded-xl bg-accent-blue text-white text-sm font-bold disabled:opacity-40"
                >
                  撮影
                </button>
                <button
                  onClick={handleRecordToggle}
                  className={`flex-1 px-4 py-3 rounded-xl text-white text-sm font-bold ${recording ? "bg-accent-red" : "bg-accent-green"}`}
                >
                  {recording ? "停止" : "録画"}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-white/70 hover:text-white hover:underline"
              >
                ファイルを選択
              </button>
              {onCancel && (
                <button
                  onClick={() => { stopCamera(); onCancel(); }}
                  className="text-xs text-white/70 hover:text-white hover:underline"
                >
                  キャンセル
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
          </>
        )}
      </div>
    </div>
  );
}
