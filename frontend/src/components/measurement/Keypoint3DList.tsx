"use client";

import type { Keypoint3D } from "@/types";
import { keypointStatus } from "@/lib/coords-3d";

type Props = {
  keypoints: Keypoint3D[];
  selectedLabel: string;
  onSelectLabel: (label: string) => void;
  onDelete: (id: string) => void;
};

export const PRESET_LABELS = [
  "右肩", "左肩", "右腰", "左腰",
  "鼻先", "首", "尾根", "右前足首", "左前足首",
  "右後足首", "左後足首",
];

const AXIS_BADGE: Record<string, string> = {
  x_cm: "X",
  y_cm: "Y",
  z_cm: "Z",
};

function AxisBadge({ confirmed, axis }: { confirmed: boolean; axis: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold
        ${confirmed
          ? "bg-accent-green text-white"
          : "bg-border-default text-ink-muted"
        }`}
    >
      {axis}
    </span>
  );
}

export function Keypoint3DList({ keypoints, selectedLabel, onSelectLabel, onDelete }: Props) {
  const usedLabels = new Set(keypoints.map(k => k.label));
  const allLabels = Array.from(new Set([...PRESET_LABELS, ...keypoints.map(k => k.label)]));

  return (
    <div className="flex flex-col gap-4">
      {/* ラベル選択 */}
      <section>
        <p className="text-xs font-bold text-ink-muted mb-2">配置する部位</p>
        <div className="flex flex-wrap gap-1.5">
          {allLabels.map(label => {
            const kp = keypoints.find(k => k.label === label);
            const status = kp ? keypointStatus(kp) : null;
            const isSelected = label === selectedLabel;
            return (
              <button
                key={label}
                onClick={() => onSelectLabel(label)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors
                  ${isSelected
                    ? "bg-accent-red text-white"
                    : status?.complete
                      ? "bg-accent-green/20 text-accent-green"
                      : status
                        ? "bg-accent-yellow/20 text-amber-700"
                        : "bg-border-default text-ink-muted"
                  }`}
              >
                {label}
                {status?.complete && " ✓"}
              </button>
            );
          })}
        </div>
      </section>

      {/* 配置済みキーポイント一覧 */}
      {keypoints.length > 0 && (
        <section>
          <p className="text-xs font-bold text-ink-muted mb-2">配置済みポイント</p>
          <div className="flex flex-col gap-1.5">
            {keypoints.map(kp => {
              const status = keypointStatus(kp);
              const isSelected = kp.label === selectedLabel;
              return (
                <div
                  key={kp.id}
                  onClick={() => onSelectLabel(kp.label)}
                  className={`rounded-xl px-3 py-2.5 cursor-pointer transition-colors
                    ${isSelected ? "bg-accent-red/10 ring-1 ring-accent-red/30" : "bg-warm-card hover:bg-warm-sub"}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-ink-primary">{kp.label}</span>
                    <div className="flex items-center gap-1">
                      <AxisBadge axis="X" confirmed={status.x} />
                      <AxisBadge axis="Y" confirmed={status.y} />
                      <AxisBadge axis="Z" confirmed={status.z} />
                      <button
                        onClick={e => { e.stopPropagation(); onDelete(kp.id); }}
                        className="ml-1 text-ink-muted hover:text-accent-red text-sm leading-none"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px] tabular-nums">
                    <CoordCell label="X" value={kp.x_cm} />
                    <CoordCell label="Y" value={kp.y_cm} />
                    <CoordCell label="Z" value={kp.z_cm} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function CoordCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={`rounded px-1.5 py-0.5 ${value != null ? "bg-warm-main" : "bg-border-default/30"}`}>
      <span className="text-ink-muted">{label}: </span>
      {value != null
        ? <span className="font-bold text-ink-primary">{value.toFixed(1)} cm</span>
        : <span className="text-ink-muted">—</span>
      }
    </div>
  );
}
