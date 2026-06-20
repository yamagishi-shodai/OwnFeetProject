import type { ViewType, Keypoint3D, CameraPose } from "@/types";

// ── ビューごとの軸マッピング ───────────────────────────────────
// px_axis: 画像の横方向(pixel_x増加) → 3D座標のどの軸(正方向)
// py_axis: 画像の縦方向(pixel_y増加) → 3D座標のどの軸
// *_inverted: 画像軸の増加方向が3D座標の負方向の場合 true

type AxisMap = {
  px_axis: "x_cm" | "y_cm" | "z_cm";
  py_axis: "x_cm" | "y_cm" | "z_cm";
  px_inverted: boolean;
  py_inverted: boolean;
};

// 犬の体軸:
//   X+ = 前(頭方向)  X- = 後(尾方向)   ← 両ビューで共有
//   Y+ = 犬の右側    Y- = 犬の左側
//   Z+ = 上(高さ)    Z- = 下
//
// 真上ビュー → XY平面（水平面）
//   pixel_x (横): 頭が画像左 → 小pixel_x=頭=X+ → px_inverted=true
//   pixel_y (縦): 犬の右側が画像下 → 大pixel_y=Y+ → py_inverted=false
//
// 右側面ビュー → XZ平面（体長×高さ）
//   pixel_x (横): 頭が画像左 → 小pixel_x=頭=X+ → px_inverted=true
//   pixel_y (縦): 上が画像上 → 小pixel_y=Z+ → py_inverted=true

export const VIEW_AXIS_MAP: Record<ViewType, AxisMap> = {
  top:        { px_axis: "x_cm", py_axis: "y_cm", px_inverted: true,  py_inverted: false },
  side_right: { px_axis: "x_cm", py_axis: "z_cm", px_inverted: true,  py_inverted: true  },
  side_left:  { px_axis: "x_cm", py_axis: "z_cm", px_inverted: false, py_inverted: true  },
  front:      { px_axis: "y_cm", py_axis: "z_cm", px_inverted: false, py_inverted: true  },
  back:       { px_axis: "y_cm", py_axis: "z_cm", px_inverted: true,  py_inverted: true  },
};

// ── ピクセル → ワールド座標（中心原点、cm 単位） ──────────────
export function pixelToWorld(
  pixelX: number,
  pixelY: number,
  viewType: ViewType,
  pixelsPerCm: number,
  imgW: number,
  imgH: number,
  mapOverride?: AxisMap
): Partial<Record<"x_cm" | "y_cm" | "z_cm", number>> {
  const map = mapOverride ?? VIEW_AXIS_MAP[viewType];

  let relX = (pixelX - imgW / 2) / pixelsPerCm;
  let relY = (pixelY - imgH / 2) / pixelsPerCm;

  if (map.px_inverted) relX = -relX;
  if (map.py_inverted) relY = -relY;

  return {
    [map.px_axis]: parseFloat(relX.toFixed(3)),
    [map.py_axis]: parseFloat(relY.toFixed(3)),
  };
}

// ── ホモグラフィ変換（9要素 row-major H、pixel → mat cm 座標） ─
export function applyHomography(H: number[], px: number, py: number): { x: number; y: number } {
  const w = H[6] * px + H[7] * py + H[8];
  return { x: (H[0] * px + H[1] * py + H[2]) / w, y: (H[3] * px + H[4] * py + H[5]) / w };
}

// ── ホモグラフィ使用版 pixelToWorld（遠近歪み補正あり） ──────
export function pixelToWorldH(
  px: number,
  py: number,
  H: number[],
  viewType: ViewType,
  matWidthCm: number,
  matHeightCm: number,
  mapOverride?: AxisMap,
): Partial<Record<"x_cm" | "y_cm" | "z_cm", number>> {
  const map = mapOverride ?? VIEW_AXIS_MAP[viewType];
  const { x: matX, y: matY } = applyHomography(H, px, py);
  let relX = matX - matWidthCm / 2;
  let relY = matY - matHeightCm / 2;
  if (map.px_inverted) relX = -relX;
  if (map.py_inverted) relY = -relY;
  return {
    [map.px_axis]: parseFloat(relX.toFixed(3)),
    [map.py_axis]: parseFloat(relY.toFixed(3)),
  };
}

// ── カメラ姿勢からの光線逆投影 ────────────────────────────────
// px, py: 元画像ピクセル座標 → ワールド空間の光線方向ベクトル
export function unprojectRay(
  px: number, py: number, pose: CameraPose,
): [number, number, number] {
  const M = pose.RT_Kinv;
  return [
    M[0]*px + M[1]*py + M[2],
    M[3]*px + M[4]*py + M[5],
    M[6]*px + M[7]*py + M[8],
  ];
}

// 光線と Z=targetZ 平面の交点（ワールド座標 x, y を返す）
export function intersectPlaneZ(
  px: number, py: number,
  pose: CameraPose,
  targetZ: number,
): { x: number; y: number } | null {
  const [C0, C1, C2] = pose.C;
  const [d0, d1, d2] = unprojectRay(px, py, pose);
  if (Math.abs(d2) < 1e-8) return null;
  const t = (targetZ - C2) / d2;
  if (t < 0) return null;
  return { x: C0 + t * d0, y: C1 + t * d1 };
}

// ── 既存 3D 点に新たな軸を上書きマージ ──────────────────────
export function merge3DPoint(
  existing: Pick<Keypoint3D, "x_cm" | "y_cm" | "z_cm">,
  partial: Partial<Record<"x_cm" | "y_cm" | "z_cm", number>>
): Pick<Keypoint3D, "x_cm" | "y_cm" | "z_cm"> {
  return {
    x_cm: partial.x_cm ?? existing.x_cm,
    y_cm: partial.y_cm ?? existing.y_cm,
    z_cm: partial.z_cm ?? existing.z_cm,
  };
}

// ── 3D ユークリッド距離 ───────────────────────────────────────
export function distance3D(
  a: Pick<Keypoint3D, "x_cm" | "y_cm" | "z_cm">,
  b: Pick<Keypoint3D, "x_cm" | "y_cm" | "z_cm">
): number | null {
  if (
    a.x_cm == null || a.y_cm == null || a.z_cm == null ||
    b.x_cm == null || b.y_cm == null || b.z_cm == null
  ) return null;
  return Math.sqrt(
    (b.x_cm - a.x_cm) ** 2 +
    (b.y_cm - a.y_cm) ** 2 +
    (b.z_cm - a.z_cm) ** 2
  );
}

// ── キーポイントの確定状況 ────────────────────────────────────
export function keypointStatus(kp: Pick<Keypoint3D, "x_cm" | "y_cm" | "z_cm">) {
  return {
    x: kp.x_cm != null,
    y: kp.y_cm != null,
    z: kp.z_cm != null,
    complete: kp.x_cm != null && kp.y_cm != null && kp.z_cm != null,
  };
}

// ── ビューが持つ軸の名前 ─────────────────────────────────────
export function viewAxes(viewType: ViewType): ("x_cm" | "y_cm" | "z_cm")[] {
  const map = VIEW_AXIS_MAP[viewType];
  return [map.px_axis, map.py_axis];
}
