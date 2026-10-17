"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  computeBodyMetrics, estimatedValue, METRIC_LABELS,
  type ManualMetrics, type MetricKey, type SideValue,
} from "@/lib/body-metrics";
import { keypointStatus } from "@/lib/coords-3d";
import type { Keypoint3D } from "@/types";

const fmt = (v: number) => v.toFixed(1);

export const METRIC_DEFS: { key: MetricKey; title: string; note: string; missing: string }[] = [
  {
    key: "frontHeight", title: "前足の高さ", note: "地面〜前足の付け根",
    missing: `${METRIC_LABELS.rightFrontBase}・${METRIC_LABELS.leftFrontBase}に点を配置してください`,
  },
  {
    key: "hindHeight", title: "後ろ足の高さ", note: "地面〜後ろ足の付け根",
    missing: `${METRIC_LABELS.rightHindBase}・${METRIC_LABELS.leftHindBase}に点を配置してください`,
  },
  {
    key: "legDistance", title: "前足と後ろ足の距離", note: "前足首〜後足首（前後方向）",
    missing: "前足首と後足首に点を配置してください",
  },
];

type Props = {
  keypoints: Keypoint3D[];          // 補正前（写真から推定した）点
  manual: ManualMetrics;
  onChange: (next: ManualMetrics) => void;
  saveError?: string | null;
};

// カルテの採寸値: 推定値 + 任意の実測値（手入力）と 3D への採用切り替え
export function BodyMetricsCard({ keypoints, manual, onChange, saveError }: Props) {
  const m = computeBodyMetrics(keypoints);
  const confirmedCount = keypoints.filter(k => keypointStatus(k).complete).length;

  function setValue(key: MetricKey, value: number | null) {
    const adopt = { ...manual.adopt };
    if (value == null) adopt[key] = false; // 値を消したら採用も外す
    onChange({ ...manual, [key]: value, adopt });
  }

  function setAdopt(key: MetricKey, on: boolean) {
    onChange({ ...manual, adopt: { ...manual.adopt, [key]: on } });
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-ink-dark">採寸値</h2>
        <span className="text-xs text-ink-muted">{confirmedCount} 部位確定</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {METRIC_DEFS.map(def => (
          <Metric
            key={def.key}
            def={def}
            estimated={estimatedValue(m, def.key)}
            detail={def.key === "legDistance" ? undefined : sideDetail(m[def.key])}
            manualValue={manual[def.key] ?? null}
            adopted={!!manual.adopt?.[def.key]}
            onValue={v => setValue(def.key, v)}
            onAdopt={on => setAdopt(def.key, on)}
          />
        ))}
      </div>
      {saveError && <p className="text-xs text-accent-red">{saveError}</p>}
    </Card>
  );
}

function sideDetail(v: SideValue | null): string | undefined {
  if (!v) return undefined;
  if (v.right != null && v.left != null) return `右 ${fmt(v.right)} / 左 ${fmt(v.left)}`;
  return v.right != null ? "右のみ" : "左のみ";
}

function Metric({ def, estimated, detail, manualValue, adopted, onValue, onAdopt }: {
  def: (typeof METRIC_DEFS)[number];
  estimated: number | null;
  detail?: string;
  manualValue: number | null;
  adopted: boolean;
  onValue: (v: number | null) => void;
  onAdopt: (on: boolean) => void;
}) {
  // 入力途中（空欄など）でも壊れないよう文字列で持ち、確定時（blur / Enter）に数値化する
  const [text, setText] = useState(manualValue != null ? String(manualValue) : "");

  function commit() {
    const trimmed = text.trim();
    const v = parseFloat(trimmed);
    const next = trimmed === "" || !Number.isFinite(v) || v <= 0 ? null : v;
    if (next === null && trimmed !== "") setText(manualValue != null ? String(manualValue) : "");
    if (next !== manualValue) onValue(next);
  }

  const inputId = `manual-${def.key}`;
  return (
    <div className={`rounded-xl px-3 py-2.5 flex flex-col gap-2 ${adopted ? "bg-accent-blue/10 ring-1 ring-accent-blue/40" : "bg-warm-sub"}`}>
      <div>
        <p className="text-xs font-bold text-ink-dark">{def.title}</p>
        <p className="text-[10px] text-ink-muted">{def.note}</p>
        {estimated != null ? (
          <>
            <p className="mt-1 text-2xl font-bold text-ink-dark tabular-nums">
              {fmt(estimated)}<span className="ml-0.5 text-sm font-bold text-ink-muted">cm</span>
              <span className="ml-1.5 text-[10px] font-bold text-ink-muted align-middle">推定</span>
            </p>
            {detail && <p className="text-[11px] text-ink-muted tabular-nums">{detail}</p>}
          </>
        ) : (
          <>
            <p className="mt-1 text-2xl font-bold text-ink-light">—</p>
            <p className="text-[11px] text-ink-muted">{def.missing}</p>
          </>
        )}
      </div>

      {/* 実測値（任意） */}
      <div className="flex flex-col gap-1 border-t border-border-light pt-2">
        <label htmlFor={inputId} className="text-[11px] font-bold text-ink-muted">実測値（任意）</label>
        <div className="flex items-center gap-1.5">
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder="例: 24.0"
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="w-full min-w-0 h-8 px-2 rounded-lg border border-border-default bg-white text-sm tabular-nums
              focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
          />
          <span className="text-xs text-ink-muted">cm</span>
        </div>
        {manualValue != null && estimated != null && (
          <p className="text-[10px] text-ink-muted tabular-nums">
            推定との差 {manualValue - estimated >= 0 ? "+" : ""}{fmt(manualValue - estimated)} cm
          </p>
        )}
        <label className={`flex items-center gap-1.5 text-[11px] font-bold
          ${manualValue == null || estimated == null ? "text-ink-light cursor-not-allowed" : "text-ink-dark cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={adopted}
            disabled={manualValue == null || estimated == null}
            onChange={e => onAdopt(e.target.checked)}
            className="accent-[#556E97]"
          />
          3Dモデルに採用
        </label>
      </div>
    </div>
  );
}
