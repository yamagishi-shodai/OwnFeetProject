import type { Keypoint3D, SessionView, ViewClick } from "@/types";
import { isSideOnly } from "@/lib/coords-3d";

// 3D ビューの「真横」「真上」視点で、撮影した写真を点に重ねて表示するための位置合わせ。
// 写真ごとに原点・縮尺が違い（体長 X は側面の写真が正）、真上の写真は頭の向きも撮影ごとに違うので、
// その写真に置いた点の画素位置と 3D 座標から「画素 → 3D」の変換を求める。
// 写真がゆがまないよう縦横同じ縮尺（s）・軸の向き（±1）・平行移動だけを使う。
//   u = s * su * pixel_x + bu   （真横: X、真上: X）
//   v = s * sv * pixel_y + bv   （真横: Z、真上: Y）

export type OverlayKind = "side" | "top";

export type PhotoFit = {
  s: number;
  su: 1 | -1;
  sv: 1 | -1;
  bu: number;
  bv: number;
};

export type OverlayPhoto = {
  kind: OverlayKind;
  url: string;
  fit: PhotoFit;
};

const AXES: Record<OverlayKind, { u: "x_cm"; v: "z_cm" | "y_cm" }> = {
  side: { u: "x_cm", v: "z_cm" },
  top: { u: "x_cm", v: "y_cm" },
};

export function fitPhoto(kind: OverlayKind, view: SessionView, clicks: ViewClick[], keypoints: Keypoint3D[]): PhotoFit | null {
  const { u, v } = AXES[kind];
  const pairs = clicks
    .filter(c => c.view_id === view.id)
    .map(c => ({ c, k: keypoints.find(k => k.id === c.keypoint_3d_id) }))
    // 真上の写真に側面のみの部位はない（Y がない）ので除く
    .filter((p): p is { c: ViewClick; k: Keypoint3D } =>
      !!p.k && p.k[u] != null && p.k[v] != null && !(kind === "top" && isSideOnly(p.k.label)));
  if (pairs.length < 2) return null;

  const n = pairs.length;
  const mean = (f: (p: (typeof pairs)[number]) => number) => pairs.reduce((a, p) => a + f(p), 0) / n;
  const mpx = mean(p => p.c.pixel_x), mpy = mean(p => p.c.pixel_y);
  const mu = mean(p => p.k[u]!), mv = mean(p => p.k[v]!);

  // 軸ごとの向き = 相関の符号
  const cov = (a: (p: (typeof pairs)[number]) => number, b: (p: (typeof pairs)[number]) => number) =>
    pairs.reduce((acc, p) => acc + a(p) * b(p), 0);
  const covU = cov(p => p.c.pixel_x - mpx, p => p.k[u]! - mu);
  const covV = cov(p => p.c.pixel_y - mpy, p => p.k[v]! - mv);
  const su = covU < 0 ? -1 : 1;
  const sv = covV < 0 ? -1 : 1;

  // 縦横共通の縮尺（最小二乗）
  const varP = cov(p => p.c.pixel_x - mpx, p => p.c.pixel_x - mpx) + cov(p => p.c.pixel_y - mpy, p => p.c.pixel_y - mpy);
  if (varP <= 0) return null;
  const s = (su * covU + sv * covV) / varP;
  if (!(s > 0) || !Number.isFinite(s)) return null;

  return { s, su, sv, bu: mu - s * su * mpx, bv: mv - s * sv * mpy };
}

// 画素 → 写真平面上の (u, v)
export function photoUV(fit: PhotoFit, px: number, py: number): [number, number] {
  return [fit.s * fit.su * px + fit.bu, fit.s * fit.sv * py + fit.bv];
}

// セッションの最新の側面・真上の写真から重ね合わせ用の情報を作る（views は新しい順）
export function buildOverlayPhotos(views: SessionView[], clicks: ViewClick[], keypoints: Keypoint3D[]): Partial<Record<OverlayKind, OverlayPhoto>> {
  const out: Partial<Record<OverlayKind, OverlayPhoto>> = {};
  const pick: Record<OverlayKind, (v: SessionView) => boolean> = {
    side: v => v.view_type === "side_left" || v.view_type === "side_right",
    top: v => v.view_type === "top",
  };
  for (const kind of ["side", "top"] as const) {
    const view = views.find(v => pick[kind](v) && v.image_url);
    if (!view?.image_url) continue;
    const fit = fitPhoto(kind, view, clicks, keypoints);
    if (fit) out[kind] = { kind, url: view.image_url, fit };
  }
  return out;
}
