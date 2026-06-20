"use client";

import { useState } from "react";

const PRESETS = ["胴長", "肩高", "腰高", "胸深", "前肢長", "後肢長", "頭長"];

type Props = {
  value: string;
  onChange: (label: string) => void;
};

export function LabelSelector({ value, onChange }: Props) {
  const [custom, setCustom] = useState("");
  const isCustomActive = !PRESETS.includes(value);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-ink-muted">採寸部位</p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(label)}
            className={`px-3 h-7 rounded-full text-xs font-bold border transition-colors
              ${value === label
                ? "bg-accent-green text-white border-accent-green"
                : "bg-white border-border-default text-ink-dark hover:bg-warm-bg"
              }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { if (custom) onChange(custom); }}
          className={`px-3 h-7 rounded-full text-xs font-bold border transition-colors
            ${isCustomActive
              ? "bg-accent-blue text-white border-accent-blue"
              : "bg-white border-border-default text-ink-dark hover:bg-warm-bg"
            }`}
        >
          カスタム
        </button>
      </div>
      <input
        type="text"
        placeholder="カスタムラベルを入力"
        value={custom}
        onChange={(e) => { setCustom(e.target.value); onChange(e.target.value); }}
        className="h-8 px-3 rounded-xl border border-border-default bg-white text-xs text-ink-primary
          focus:outline-none focus:ring-2 focus:ring-accent-green/40"
      />
    </div>
  );
}
