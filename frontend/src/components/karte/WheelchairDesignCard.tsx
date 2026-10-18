"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Card } from "@/components/ui/Card";
import {
  WHEELCHAIR_DEFS, WHEELCHAIR_KEYS, pipeRecordsCsv,
  type WheelchairDesign, type WheelchairFrame, type WheelchairKey, type WheelchairValues,
} from "@/lib/wheelchair";
import { wheelchairDxf } from "@/lib/wheelchair-dxf";
import { JointTable, PipeTable, frameSpecText, mm } from "./WheelchairTables";

// 接合部の部品の 3D 表示（three.js とブーリアン演算はブラウザでだけ読み込む）
const JointPartsPreview = dynamic(
  () => import("./JointPartsPreview").then(m => ({ default: m.JointPartsPreview })),
  { ssr: false, loading: () => <p className="text-[11px] text-ink-muted">部品の形を作成中…</p> }
);

const fmt = (v: number) => v.toFixed(1);
const STEP = 0.5;

type Props = {
  estimated: WheelchairValues | null;   // null = まだ採寸がない
  design: WheelchairDesign;
  onChange: (next: WheelchairDesign) => void;
  frame?: WheelchairFrame | null;       // 設計値から組み立てたフレーム（垂直材長・注意事項の表示用）
  preview?: ReactNode;                  // 車椅子の 3D ビュー
  saveError?: string | null;
};

// 車椅子設計（後脚サポート型・2輪）: 左に車椅子の 3D、右にスライダーと数値入力で寸法を微調整する
export function WheelchairDesignCard({ estimated, design, onChange, frame, preview, saveError }: Props) {
  const overridden = WHEELCHAIR_KEYS.filter(k => design[k] != null).length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink-dark">車椅子設計</h2>
          <p className="text-[11px] text-ink-muted">後脚サポート型（2輪）。採寸値から自動で計算した寸法を、スライダーか数値で微調整できます</p>
        </div>
        {overridden > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-xs text-accent-blue hover:underline shrink-0"
          >
            すべて自動計算に戻す
          </button>
        )}
      </div>

      {!estimated ? (
        <p className="text-xs text-ink-muted py-2">写真に点を配置すると、採寸値から寸法を自動で計算します</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
          <div className="flex flex-col gap-2">
            {preview}
            {frame && <FrameSummary frame={frame} />}
          </div>

          <div className="flex flex-col gap-2">
            {WHEELCHAIR_KEYS.map(key => (
              <DesignSlider
                key={key}
                itemKey={key}
                estimated={estimated[key]}
                value={design[key] ?? null}
                onValue={v => onChange({ ...design, [key]: v })}
              />
            ))}
          </div>
        </div>
      )}

      {estimated && frame && frame.pipeRecords.length > 0 && <PartsList frame={frame} />}

      {saveError && <p className="text-xs text-accent-red">{saveError}</p>}
      <p className="text-[10px] text-ink-light">
        ※ 寸法は採寸値からの目安です。製作前に実際の体に合わせて確認してください
      </p>
    </Card>
  );
}

function FrameSummary({ frame }: { frame: WheelchairFrame }) {
  // 三面図（側面図・平面図・正面図、寸法線つき）を DXF（mm）で保存する
  function downloadDxf() {
    // 日本時間の日付（toISOString は UTC なので朝9時前は前日になる）
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const blob = new Blob([wheelchairDxf(frame, { date })], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wheelchair-drawing-${date}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl bg-warm-sub px-3 py-2 text-[11px] text-ink-muted">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p>
          <span className="font-bold text-ink-dark">垂直材長 {frame.verticalLength.toFixed(1)} cm</span>
          （車輪が地面に接するよう自動計算）
        </p>
        {frame.pipes.length > 0 && (
          <button type="button" onClick={downloadDxf} className="text-xs font-bold text-accent-blue hover:underline shrink-0">
            図面（DXF）をダウンロード
          </button>
        )}
      </div>
      <p>{frameSpecText()}</p>
      {frame.warnings.map(w => (
        <p key={w} className="font-bold text-accent-red">⚠ {w}</p>
      ))}
    </div>
  );
}

// 部材一覧: パイプ（切断長）と接合部（ジョイント）
function PartsList({ frame }: { frame: WheelchairFrame }) {
  const pipeCount = frame.pipeRecords.reduce((a, r) => a + r.count, 0);
  const jointCount = frame.jointRecords.reduce((a, j) => a + j.count, 0);
  const doubleJoints = frame.jointRecords.filter(j => j.type === "double");
  // 部品の 3D は開いたときだけ作る（閉じている間はブーリアン演算や描画をしない）
  const [open, setOpen] = useState(false);

  function downloadCsv() {
    const blob = new Blob([pipeRecordsCsv(frame.pipeRecords)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wheelchair-pipes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // 長いので折りたたんで表示する（見出しに本数・合計長だけ出す）
  return (
    <details className="group rounded-xl border border-border-light" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 select-none
        hover:bg-warm-sub rounded-xl [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-bold text-ink-dark">
          <span className="inline-block w-3 text-ink-muted transition-transform group-open:rotate-90">▸</span>
          部材一覧
        </span>
        <span className="text-[11px] text-ink-muted tabular-nums">
          パイプ {pipeCount} 本・合計 {mm(frame.totalPipeLength)} mm ／ 接合部 {jointCount} 個
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-bold text-ink-dark">パイプ一覧（切断寸法）</h3>
            <button type="button" onClick={downloadCsv} className="text-xs text-accent-blue hover:underline shrink-0">
              CSV をダウンロード
            </button>
          </div>
          <PipeTable frame={frame} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-ink-dark">接合部一覧（ジョイント）</h3>
          <JointTable frame={frame} />
          {doubleJoints.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <h4 className="text-[11px] font-bold text-ink-dark">二重の接合部の部品（外側と内側を一体化した形・mm）</h4>
              {open && <JointPartsPreview joints={doubleJoints} />}
            </div>
          )}
        </section>
      </div>
    </details>
  );
}

// スライダーの範囲: 自動計算の値の 0.5〜1.5 倍（設計値がはみ出すときは広げる）
function sliderRange(estimated: number, value: number | null) {
  let min = Math.max(STEP, Math.floor((estimated * 0.5) / STEP) * STEP);
  let max = Math.ceil((estimated * 1.5) / STEP) * STEP;
  if (value != null) { min = Math.min(min, value); max = Math.max(max, value); }
  return { min, max };
}

function DesignSlider({ itemKey, estimated, value, onValue }: {
  itemKey: WheelchairKey;
  estimated: number | null;
  value: number | null;
  onValue: (v: number | null) => void;
}) {
  const def = WHEELCHAIR_DEFS[itemKey];
  // 数値入力は入力中だけ文字列で持ち、確定時（blur / Enter）に数値化する。入力中以外は現在の値を表示する
  const [editing, setEditing] = useState<string | null>(null);
  const used = value ?? estimated;
  const inputId = `wheelchair-${itemKey}`;

  function commit() {
    if (editing == null) return;
    const v = parseFloat(editing.trim());
    setEditing(null);
    if (editing.trim() === "") { onValue(null); return; } // 空欄 = 自動に戻す
    if (Number.isFinite(v) && v > 0 && v !== used) onValue(v);
  }

  return (
    <div className={`rounded-xl px-3 py-2.5 flex flex-col gap-1.5 ${value != null ? "bg-accent-blue/10 ring-1 ring-accent-blue/40" : "bg-warm-sub"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={inputId} className="text-xs font-bold text-ink-dark">{def.title}</label>
          <p className="text-[10px] text-ink-muted">{def.note}</p>
        </div>
        {value != null ? (
          <button
            type="button"
            onClick={() => onValue(null)}
            className="shrink-0 text-[10px] font-bold text-accent-blue hover:underline"
            title={estimated != null ? `自動計算の値（${fmt(estimated)} cm）に戻す` : undefined}
          >
            ↺ 自動に戻す
          </button>
        ) : (
          <span className="shrink-0 text-[10px] font-bold text-ink-muted">自動</span>
        )}
      </div>

      {estimated == null || used == null ? (
        <p className="text-[11px] text-ink-muted">{def.missing}</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              type="range"
              aria-label={`${def.title}のスライダー`}
              {...sliderRange(estimated, value)}
              step={STEP}
              value={used}
              onChange={e => onValue(Number(e.target.value))}
              className="flex-1 min-w-0 accent-[#556E97]"
            />
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min="0"
              step={STEP}
              value={editing ?? fmt(used)}
              onFocus={e => { setEditing(fmt(used)); e.currentTarget.select(); }}
              onChange={e => setEditing(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="w-20 h-8 px-2 rounded-lg border border-border-default bg-white text-sm text-right tabular-nums
                focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
            />
            <span className="text-xs text-ink-muted">cm</span>
          </div>
          {value != null && (
            <p className="text-[10px] text-ink-muted tabular-nums">
              自動 {fmt(estimated)} cm との差 {value - estimated >= 0 ? "+" : ""}{fmt(value - estimated)} cm
            </p>
          )}
        </>
      )}
    </div>
  );
}
