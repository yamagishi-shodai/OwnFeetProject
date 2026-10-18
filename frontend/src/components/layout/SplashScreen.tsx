"use client";

import { useEffect, useState } from "react";
import {
  LOGO_BAND_DARK, LOGO_BAND_LIGHT, LOGO_COLORS, LOGO_RING, LOGO_TEXT_MAIN, LOGO_TEXT_SUB, LOGO_VIEWBOX,
} from "./logo-paths";
import { SPLASH_STORAGE_KEY } from "./splash-key";

// 起動時のスタート画面。ロゴをパーツごとに組み上げてからフェードアウトし、下のページを見せる。
// タブごとに1回だけ（sessionStorage）。2回目以降は layout の <head> のスクリプトが
// <html data-splash-done> を付けるので、CSS で最初から隠れていてちらつかない。クリックでスキップできる

// 表示時間（ms）。HIDE_AT でフェードアウトを始め、FADE_MS で消える
const HIDE_AT = 2300;
const HIDE_AT_REDUCED = 900;
const FADE_MS = 500;

const SPLASH_CSS = `
html[data-splash-done] .ofp-splash { display: none; }
.ofp-splash { transition: opacity ${FADE_MS}ms ease; }
.ofp-splash[data-phase="out"] { opacity: 0; pointer-events: none; }
.ofp-splash .part { opacity: 0; animation-fill-mode: forwards; animation-timing-function: cubic-bezier(.2,.8,.2,1); }
.ofp-splash .ring { transform-origin: 111px 102px; animation-name: ofp-pop; animation-duration: .7s; }
.ofp-splash .band-dark { animation-name: ofp-step; animation-duration: .6s; animation-delay: .35s; }
.ofp-splash .band-light { animation-name: ofp-step; animation-duration: .6s; animation-delay: .55s; }
.ofp-splash .text-main { animation-name: ofp-wipe; animation-duration: .7s; animation-delay: .9s; }
.ofp-splash .text-sub { animation-name: ofp-rise; animation-duration: .6s; animation-delay: 1.25s; }
.ofp-splash .bar { transform-origin: left; transform: scaleX(0); animation: ofp-bar ${HIDE_AT}ms linear forwards; }
@keyframes ofp-pop { from { opacity: 0; transform: scale(.55) rotate(-90deg); } to { opacity: 1; transform: none; } }
@keyframes ofp-step { from { opacity: 0; transform: translate(-36px, 36px); } to { opacity: 1; transform: none; } }
@keyframes ofp-wipe { from { opacity: 1; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); } }
@keyframes ofp-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes ofp-bar { to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) {
  .ofp-splash .part { animation: none; opacity: 1; }
  .ofp-splash .bar { animation: none; }
}
`;

export function SplashScreen() {
  const [phase, setPhase] = useState<"play" | "out" | "done">("play");

  useEffect(() => {
    let shown = document.documentElement.hasAttribute("data-splash-done");
    try {
      shown ||= sessionStorage.getItem(SPLASH_STORAGE_KEY) === "1";
      sessionStorage.setItem(SPLASH_STORAGE_KEY, "1");
    } catch { /* 保存できなくても毎回出るだけ */ }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setPhase(p => (p === "play" ? "out" : p)), shown ? 0 : reduced ? HIDE_AT_REDUCED : HIDE_AT);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => setPhase("done"), FADE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      className="ofp-splash fixed inset-0 z-[100] flex flex-col items-center justify-center gap-10 bg-warm-sub cursor-pointer print:hidden"
      data-phase={phase}
      onClick={() => setPhase("out")}
      aria-hidden
    >
      <style>{SPLASH_CSS}</style>
      <svg viewBox={LOGO_VIEWBOX} className="w-[min(80vw,560px)] h-auto overflow-visible">
        <path className="part band-light" fill={LOGO_COLORS.light} d={LOGO_BAND_LIGHT} />
        <path className="part band-dark" fill={LOGO_COLORS.dark} d={LOGO_BAND_DARK} />
        <path className="part ring" fill={LOGO_COLORS.dark} d={LOGO_RING} />
        <g className="part text-main" fill={LOGO_COLORS.text}>
          {LOGO_TEXT_MAIN.map(d => <path key={d} d={d} />)}
        </g>
        <g className="part text-sub" fill={LOGO_COLORS.text}>
          {LOGO_TEXT_SUB.map(d => <path key={d} d={d} />)}
        </g>
      </svg>
      <div className="w-[min(40vw,200px)] h-0.5 rounded-full bg-border-light overflow-hidden">
        <div className="bar h-full" style={{ background: LOGO_COLORS.dark }} />
      </div>
    </div>
  );
}
