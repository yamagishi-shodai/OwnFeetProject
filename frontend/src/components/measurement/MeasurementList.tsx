"use client";

import type { Measurement } from "@/types";

type Props = {
  measurements: Measurement[];
  onDelete: (id: string) => void;
};

export function MeasurementList({ measurements, onDelete }: Props) {
  if (measurements.length === 0) {
    return (
      <p className="text-xs text-ink-light text-center py-4">
        採寸データがありません
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {measurements.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between gap-3 px-3 py-2
            bg-white border border-border-default rounded-xl text-sm"
        >
          <span className="font-bold text-ink-dark shrink-0">{m.label}</span>
          <span className="text-accent-red font-bold tabular-nums">
            {m.value_cm.toFixed(1)} cm
          </span>
          <button
            onClick={() => onDelete(m.id)}
            className="text-xs text-ink-light hover:text-accent-red transition-colors ml-auto"
            aria-label="削除"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
