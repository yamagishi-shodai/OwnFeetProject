// 犬のシルエット（頭が左）。座標は 0..70 × 0..50 程度の SVG 単位で、呼び出し側で配置・拡大する
// しっぽは stroke=currentColor なので、className で fill と text の色を揃えて渡す

type Props = { x?: number; y?: number; className?: string };

// 側面から見た犬
export function DogSide({ x = 0, y = 0, className = "fill-ink-dark text-ink-dark" }: Props) {
  return (
    <g transform={`translate(${x} ${y})`} className={className}>
      <ellipse cx="40" cy="30" rx="18" ry="9" />
      <circle cx="18" cy="19" r="7" />
      <path d="M12 20 L5 23 L12 25 Z" />
      <path d="M20 13 L24 8 L25 15 Z" />
      <path d="M22 22 L28 26 L26 30 L20 26 Z" />
      <rect x="26" y="34" width="4" height="14" rx="1.5" />
      <rect x="33" y="34" width="4" height="14" rx="1.5" />
      <rect x="45" y="34" width="4" height="14" rx="1.5" />
      <rect x="51" y="34" width="4" height="14" rx="1.5" />
      <path d="M57 27 Q66 20 68 14" fill="none" strokeWidth="3" strokeLinecap="round" stroke="currentColor" />
    </g>
  );
}

// 真上から見た犬
export function DogTop({ x = 0, y = 0, className = "fill-ink-dark text-ink-dark" }: Props) {
  return (
    <g transform={`translate(${x} ${y})`} className={className}>
      <ellipse cx="38" cy="25" rx="20" ry="8" />
      <circle cx="13" cy="25" r="6" />
      <path d="M9 25 L1 25 L8 22 Z" />
      <ellipse cx="15" cy="18" rx="3" ry="2" />
      <ellipse cx="15" cy="32" rx="3" ry="2" />
      <path d="M17 23 L22 22 L22 28 L17 27 Z" />
      <rect x="25" y="12" width="4" height="8" rx="1.5" />
      <rect x="25" y="30" width="4" height="8" rx="1.5" />
      <rect x="47" y="12" width="4" height="8" rx="1.5" />
      <rect x="47" y="30" width="4" height="8" rx="1.5" />
      <path d="M58 25 Q65 25 70 21" fill="none" strokeWidth="3" strokeLinecap="round" stroke="currentColor" />
    </g>
  );
}
