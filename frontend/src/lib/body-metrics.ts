import type { Keypoint3D } from "@/types";
import { keypointStatus } from "@/lib/coords-3d";

// 車椅子の寸法に使う採寸値。座標は DB 座標系（X=体長・前が+、Y=体幅、Z=高さ・上が+、単位 cm）

export const METRIC_LABELS = {
  rightFrontBase: "右前足付け根", leftFrontBase: "左前足付け根",
  rightHindBase: "右後足付け根", leftHindBase: "左後足付け根",
  rightFrontFoot: "右前足首", leftFrontFoot: "左前足首",
  rightHindFoot: "右後足首", leftHindFoot: "左後足首",
} as const;

type P3 = { x: number; y: number; z: number };

export type SideValue = {
  avg: number;
  right: number | null;
  left: number | null;
};

export type BodyMetrics = {
  groundZ: number | null;
  frontHeight: SideValue | null;   // 地面 → 前足の付け根
  hindHeight: SideValue | null;    // 地面 → 後ろ足の付け根
  legDistance: { value: number; frontX: number; hindX: number } | null; // 前足首と後足首の前後距離
  // 3D の寸法線用の代表点（左右の中点）
  anchors: {
    frontBaseMid: P3 | null;
    hindBaseMid: P3 | null;
    frontFootMid: P3 | null;
    hindFootMid: P3 | null;
  };
};

// 地面 = 3軸そろった点のうち一番低い Z（ふつうは足先）。3Dビューの地面と同じ基準
export function groundZ(keypoints: Keypoint3D[]): number | null {
  const zs = keypoints.filter(k => keypointStatus(k).complete).map(k => k.z_cm!);
  return zs.length ? Math.min(...zs) : null;
}

export function computeBodyMetrics(keypoints: Keypoint3D[]): BodyMetrics {
  const complete = new Map(
    keypoints
      .filter(k => keypointStatus(k).complete)
      .map(k => [k.label, { x: k.x_cm!, y: k.y_cm ?? 0, z: k.z_cm! } as P3])
  );
  const get = (label: string) => complete.get(label) ?? null;
  const ground = groundZ(keypoints);

  const frontBaseMid = mid(get(METRIC_LABELS.rightFrontBase), get(METRIC_LABELS.leftFrontBase));
  const hindBaseMid = mid(get(METRIC_LABELS.rightHindBase), get(METRIC_LABELS.leftHindBase));
  const frontFootMid = mid(get(METRIC_LABELS.rightFrontFoot), get(METRIC_LABELS.leftFrontFoot));
  const hindFootMid = mid(get(METRIC_LABELS.rightHindFoot), get(METRIC_LABELS.leftHindFoot));

  const heightFromGround = (r: P3 | null, l: P3 | null): SideValue | null => {
    if (ground == null || (!r && !l)) return null;
    const right = r ? r.z - ground : null;
    const left = l ? l.z - ground : null;
    const vals = [right, left].filter((v): v is number => v != null);
    return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, right, left };
  };

  return {
    groundZ: ground,
    frontHeight: heightFromGround(get(METRIC_LABELS.rightFrontBase), get(METRIC_LABELS.leftFrontBase)),
    hindHeight: heightFromGround(get(METRIC_LABELS.rightHindBase), get(METRIC_LABELS.leftHindBase)),
    legDistance: frontFootMid && hindFootMid
      ? { value: Math.abs(frontFootMid.x - hindFootMid.x), frontX: frontFootMid.x, hindX: hindFootMid.x }
      : null,
    anchors: { frontBaseMid, hindBaseMid, frontFootMid, hindFootMid },
  };
}

// 左右の中点（片方しかなければその点）
function mid(a: P3 | null, b: P3 | null): P3 | null {
  if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  return a ?? b;
}

// ── 実測値（手入力）と 3D モデルへの採用 ─────────────────────────

export type MetricKey = "frontHeight" | "hindHeight" | "legDistance";
export const METRIC_KEYS: MetricKey[] = ["frontHeight", "hindHeight", "legDistance"];

// measurement_sessions.manual_metrics（jsonb）の中身
export type ManualMetrics = Partial<Record<MetricKey, number | null>> & {
  adopt?: Partial<Record<MetricKey, boolean>>;
};

export function estimatedValue(m: BodyMetrics, key: MetricKey): number | null {
  if (key === "legDistance") return m.legDistance?.value ?? null;
  return m[key]?.avg ?? null;
}

// 採用中で値がある実測値だけを返す
export function adoptedValues(manual: ManualMetrics | null | undefined): Partial<Record<MetricKey, number>> {
  const out: Partial<Record<MetricKey, number>> = {};
  for (const k of METRIC_KEYS) {
    const v = manual?.[k];
    if (manual?.adopt?.[k] && v != null && v > 0) out[k] = v;
  }
  return out;
}

// 採用した実測値に合うよう、その採寸値の対象となる点だけを動かしたコピーを返す
// （表示用。保存済みの座標は変えない。関係ない点は動かさない）
// - 前足の高さ: 左右の前足付け根を同じだけ上下に動かす（左右差は保ったまま平均を実測値に）
// - 後ろ足の高さ: 左右の後足付け根を同じだけ上下に動かす
// - 前後の距離: 前足首（左右）を前へ、後足首（左右）を後ろへ、差の半分ずつ動かす
export function applyManualMetrics(keypoints: Keypoint3D[], manual: ManualMetrics | null | undefined): Keypoint3D[] {
  const adopted = adoptedValues(manual);
  if (Object.keys(adopted).length === 0) return keypoints;

  const m = computeBodyMetrics(keypoints);
  const delta = (key: MetricKey) => {
    const est = estimatedValue(m, key);
    const v = adopted[key];
    return v != null && est != null ? v - est : 0;
  };
  const dzFront = delta("frontHeight");
  const dzHind = delta("hindHeight");
  // 前足首の方が X が大きい（前が +X）前提。逆なら符号を反転
  const legSign = m.legDistance && m.legDistance.frontX < m.legDistance.hindX ? -1 : 1;
  const dxHalf = (delta("legDistance") / 2) * legSign;

  const moves: Record<string, { dx?: number; dz?: number }> = {
    [METRIC_LABELS.rightFrontBase]: { dz: dzFront },
    [METRIC_LABELS.leftFrontBase]: { dz: dzFront },
    [METRIC_LABELS.rightHindBase]: { dz: dzHind },
    [METRIC_LABELS.leftHindBase]: { dz: dzHind },
    [METRIC_LABELS.rightFrontFoot]: { dx: dxHalf },
    [METRIC_LABELS.leftFrontFoot]: { dx: dxHalf },
    [METRIC_LABELS.rightHindFoot]: { dx: -dxHalf },
    [METRIC_LABELS.leftHindFoot]: { dx: -dxHalf },
  };

  return keypoints.map(k => {
    const mv = moves[k.label];
    if (!mv || (!mv.dx && !mv.dz)) return k;
    return {
      ...k,
      x_cm: k.x_cm == null ? null : k.x_cm + (mv.dx ?? 0),
      z_cm: k.z_cm == null ? null : k.z_cm + (mv.dz ?? 0),
    };
  });
}
