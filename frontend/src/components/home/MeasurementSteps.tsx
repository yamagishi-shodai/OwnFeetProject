import { DogSide } from "@/components/illustrations/DogSilhouette";

// ホーム画面の採寸手順ガイド。イラストはテーマ色に合わせたインライン SVG

type Step = {
  title: string;
  description: string;
  Illustration: () => React.JSX.Element;
};

const STEPS: Step[] = [
  {
    title: "基準物を置く",
    description: "定規など長さのわかる物を、犬が立つ位置のそばに置きます",
    Illustration: ReferenceObjectIllustration,
  },
  {
    title: "左側面から撮影",
    description: "犬の左側から、頭が画面の左になるように撮ります",
    Illustration: SideCaptureIllustration,
  },
  {
    title: "部位をクリック",
    description: "基準物の長さでスケールを設定し、採寸点をクリックします",
    Illustration: ClickIllustration,
  },
  {
    title: "真上を追加して3D確認",
    description: "真上の写真を追加すると体幅も求まり、3Dで確認できます",
    Illustration: ThreeDIllustration,
  },
];

export function MeasurementSteps() {
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {STEPS.map(({ title, description, Illustration }, i) => (
        <li key={title} className="flex flex-col gap-2 rounded-xl bg-warm-sub p-3">
          <div className="aspect-[3/2] rounded-lg bg-warm-card flex items-center justify-center">
            <Illustration />
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent-green text-white text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-bold text-ink-dark">{title}</p>
              <p className="text-xs text-ink-muted mt-0.5">{description}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── イラスト ──────────────────────────────────────────────────

const svgProps = {
  viewBox: "0 0 120 80",
  className: "w-full h-full",
  "aria-hidden": true,
} as const;

function ReferenceObjectIllustration() {
  const ticks = [];
  for (let i = 0; i <= 20; i++) {
    const tx = 20 + i * 4;
    ticks.push(<line key={i} x1={tx} y1="48" x2={tx} y2={i % 5 === 0 ? 55 : 51} />);
  }
  return (
    <svg {...svgProps}>
      {/* 床 */}
      <rect x="10" y="20" width="100" height="50" rx="3" className="fill-warm-main" />
      {/* 犬の立ち位置 */}
      <ellipse cx="60" cy="32" rx="30" ry="8" fill="none" strokeDasharray="3 2" strokeWidth="1.2" className="stroke-accent-green" />
      <text x="60" y="34.5" fontSize="6" textAnchor="middle" className="fill-accent-green">犬の立ち位置</text>
      {/* 定規（基準物） */}
      <rect x="16" y="46" width="88" height="12" rx="1.5" className="fill-accent-yellow" />
      <g className="stroke-ink-dark" strokeWidth="0.6">{ticks}</g>
      <text x="60" y="66" fontSize="6" fontWeight="bold" textAnchor="middle" className="fill-ink-dark">↔ 長さがわかる</text>
    </svg>
  );
}

function SideCaptureIllustration() {
  return (
    <svg {...svgProps}>
      <rect x="20" y="51" width="80" height="3" rx="1" className="fill-border-light" />
      <DogSide x={22} y={3} />
      {/* カメラ（犬の左側＝手前から撮影）。背面から見たスマホ */}
      <path d="M60 64 L60 56" strokeWidth="1.5" strokeDasharray="2 1.5" className="stroke-accent-blue" />
      <path d="M57 58 L60 54.5 L63 58" fill="none" strokeWidth="1.5" strokeLinecap="round" className="stroke-accent-blue" />
      <g transform="translate(49 65)">
        <rect width="22" height="12" rx="2.5" className="fill-accent-blue" />
        <rect x="3" y="2" width="16" height="8" rx="1" className="fill-white" />
        <circle cx="11" cy="6" r="1.5" className="fill-accent-blue" />
      </g>
      <text x="8" y="12" fontSize="8" fontWeight="bold" className="fill-accent-green">← 頭</text>
    </svg>
  );
}

function ClickIllustration() {
  return (
    <svg {...svgProps}>
      <rect x="6" y="6" width="108" height="68" rx="3" className="fill-warm-main" />
      <DogSide x={20} y={14} />
      <line x1="34" y1="34" x2="70" y2="34" strokeWidth="1.5" className="stroke-accent-yellow" />
      <circle cx="34" cy="34" r="3" className="fill-accent-red stroke-white" strokeWidth="1" />
      <circle cx="70" cy="34" r="3" className="fill-accent-red stroke-white" strokeWidth="1" />
      <rect x="40" y="24" width="24" height="8" rx="2" className="fill-white" />
      <text x="52" y="30" fontSize="6" fontWeight="bold" textAnchor="middle" className="fill-ink-dark">36.0cm</text>
      {/* カーソル */}
      <path d="M72 37 L72 50 L75.5 46.5 L78.5 52 L80.5 51 L77.5 45.5 L82 45.5 Z" className="fill-white stroke-ink-primary" strokeWidth="0.8" />
    </svg>
  );
}

function ThreeDIllustration() {
  return (
    <svg {...svgProps}>
      {/* 立方体のワイヤーフレーム */}
      <g fill="none" strokeWidth="1" className="stroke-ink-light">
        <path d="M34 26 L70 26 L70 62 L34 62 Z" />
        <path d="M50 14 L86 14 L86 50 L50 50 Z" strokeDasharray="2 2" />
        <path d="M34 26 L50 14 M70 26 L86 14 M70 62 L86 50 M34 62 L50 50" />
      </g>
      {/* 3D 座標軸 */}
      <g strokeWidth="1.5" strokeLinecap="round">
        <line x1="34" y1="62" x2="20" y2="62" className="stroke-accent-red" />
        <line x1="34" y1="62" x2="34" y2="46" className="stroke-accent-green" />
        <line x1="34" y1="62" x2="42" y2="56" className="stroke-accent-blue" />
      </g>
      {/* キーポイント */}
      <g className="fill-accent-red">
        <circle cx="44" cy="34" r="2.5" />
        <circle cx="62" cy="30" r="2.5" />
        <circle cx="72" cy="38" r="2.5" />
        <circle cx="52" cy="48" r="2.5" />
      </g>
      <path d="M44 34 L62 30 L72 38 M62 30 L52 48" fill="none" strokeWidth="1" className="stroke-accent-yellow" />
      {/* 回転矢印 */}
      <path d="M94 56 A14 8 0 1 1 106 50" fill="none" strokeWidth="1.5" className="stroke-accent-blue" />
      <path d="M106 50 L102 47 M106 50 L107 45.5" strokeWidth="1.5" strokeLinecap="round" className="stroke-accent-blue" />
    </svg>
  );
}
