// ホーム画面の採寸手順ガイド。各手順の画像は public 配下（3:2）

type Step = {
  title: string;
  description: string;
  image: string;
};

const STEPS: Step[] = [
  {
    title: "横と上から撮影",
    description: "定規など長さのわかる物を添えて、犬を左側面と真上から撮影します",
    image: "/白いスタジオのテリア犬 profile.png",
  },
  {
    title: "採寸して3D化",
    description: "写真に体の部位の点を置くと、寸法を計算して3Dモデルにします",
    image: "/図2.png",
  },
  {
    title: "車椅子を設計",
    description: "採寸値から車椅子の寸法を自動計算。3Dで犬に重ねて微調整できます",
    image: "/図3.png",
  },
  {
    title: "カルテを出力",
    description: "採寸値・3D・部材一覧をまとめたカルテを PDF で保存できます",
    image: "/図4.png",
  },
];

export function MeasurementSteps() {
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {STEPS.map(({ title, description, image }, i) => (
        <li key={title} className="flex flex-col gap-2 rounded-xl bg-warm-sub p-3">
          <div className="aspect-[3/2] rounded-lg bg-warm-card overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="w-full h-full object-cover" />
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
