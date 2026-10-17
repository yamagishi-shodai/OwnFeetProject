"use client";

import { useState } from "react";
import type { Keypoint3D, SessionView, ViewClick } from "@/types";
import { VIEW_LABELS } from "@/types";

type Props = {
  view: SessionView;
  keypoints: Keypoint3D[];
  clicks: ViewClick[];
};

// 採寸点を重ねた写真（閲覧専用）。SVG の viewBox を画像の実寸に合わせ、クリック座標をそのまま使う
export function AnnotatedViewImage({ view, keypoints, clicks }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  if (!view.image_url) return null;

  const points = keypoints.flatMap(kp => {
    const click = clicks.find(c => c.view_id === view.id && c.keypoint_3d_id === kp.id);
    return click ? [{ label: kp.label, x: click.pixel_x, y: click.pixel_y }] : [];
  });

  // 画像の解像度に関わらず見た目の大きさを揃える
  const unit = size ? size.w / 100 : 1;

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-xs font-bold text-ink-muted">{VIEW_LABELS[view.view_type]}</figcaption>
      <div className="relative rounded-xl overflow-hidden bg-warm-gutter">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={view.image_url}
          alt={`${VIEW_LABELS[view.view_type]}の写真`}
          className="w-full h-auto block"
          onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
        {size && (
          <svg
            viewBox={`0 0 ${size.w} ${size.h}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden
          >
            {points.map(p => (
              <g key={p.label}>
                <circle cx={p.x} cy={p.y} r={unit * 0.9} fill="#3E6954" stroke="white" strokeWidth={unit * 0.3} />
                <text
                  x={p.x + unit * 1.4}
                  y={p.y - unit * 1.0}
                  fontSize={unit * 2.2}
                  fontWeight="bold"
                  fill="#3E6954"
                  stroke="white"
                  strokeWidth={unit * 0.5}
                  paintOrder="stroke"
                >
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </figure>
  );
}
