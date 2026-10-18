import {
  FRAME_SPEC, JOINT_OUTER_R,
  type V3, type WheelchairFrame,
} from "@/lib/wheelchair";

// 車椅子の三面図（側面図・平面図・正面図）を DXF（R12 / AC1009、単位 mm）で出力する。
// 各部材を正射影で描き（隠れ線の処理はしない）、主要寸法を寸法線で入れる。
// 文字は CAD で文字化けしないよう英数字だけにする。
// 座標は buildWheelchairFrame と同じ（X=前+、Y=右+、Z=上、地面 Z=0、cm）で、ここで mm に直す

const MM = 10;
const TEXT_H = 4;        // 寸法の文字高さ
const TITLE_H = 6;       // 図名の文字高さ
const DIM_GAP = 12;      // 形から寸法線までの距離
const DIM_STEP = 10;     // 寸法線を重ねるときの間隔
const VIEW_GAP = 70;     // 図と図の間隔
const TICK = 2.5;        // 寸法線の端の斜線の長さ

type P2 = [number, number];
type Entity =
  | { kind: "line"; layer: Layer; a: P2; b: P2 }
  | { kind: "circle"; layer: Layer; c: P2; r: number }
  | { kind: "poly"; layer: Layer; pts: P2[]; closed: boolean }
  | { kind: "text"; layer: Layer; p: P2; h: number; text: string; rot: number };

type Layer = "FRAME" | "JOINT" | "WHEEL" | "CENTER" | "DIM" | "TEXT";
// DXF の色番号（ACI）
const LAYERS: Record<Layer, number> = { FRAME: 7, JOINT: 1, WHEEL: 5, CENTER: 8, DIM: 3, TEXT: 7 };

// ── 投影 ────────────────────────────────────────────────────
// 側面図: 犬の左側から見る（前が左）。平面図: 上から見る（前が左、犬の右が上）。正面図: 前から見る（犬の右が左）
type ViewKind = "side" | "plan" | "front";
const PROJECT: Record<ViewKind, (p: V3) => P2> = {
  side: p => [-p[0] * MM, p[2] * MM],
  plan: p => [-p[0] * MM, p[1] * MM],
  front: p => [-p[1] * MM, p[2] * MM],
};

const sub2 = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const add2 = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const mul2 = (a: P2, s: number): P2 => [a[0] * s, a[1] * s];
const len2 = (a: P2) => Math.hypot(a[0], a[1]);
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return mul3(a, 1 / l); };

// 円柱（a→b、半径 r）の投影: 軸が奥行き方向なら円、それ以外は輪郭の2本の線と両端の線
function tube(out: Entity[], view: ViewKind, a: V3, b: V3, r: number, layer: Layer, centerLine: boolean) {
  const pa = PROJECT[view](a), pb = PROJECT[view](b);
  const rr = r * MM;
  const d = sub2(pb, pa);
  const l = len2(d);
  if (l < rr * 0.05) { out.push({ kind: "circle", layer, c: pa, r: rr }); return; }
  const n: P2 = [-d[1] / l * rr, d[0] / l * rr];
  const a1 = add2(pa, n), a2 = sub2(pa, n), b1 = add2(pb, n), b2 = sub2(pb, n);
  out.push(
    { kind: "line", layer, a: a1, b: b1 },
    { kind: "line", layer, a: a2, b: b2 },
    { kind: "line", layer, a: a1, b: a2 },
    { kind: "line", layer, a: b1, b: b2 },
  );
  if (centerLine) out.push({ kind: "line", layer: "CENTER", a: pa, b: pb });
}

// 3D の円（中心 c・法線 axis・半径 r）の投影（楕円）を折れ線で
function circle3(out: Entity[], view: ViewKind, c: V3, axis: V3, r: number, layer: Layer) {
  const n = norm3(axis);
  const ref: V3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm3(cross3(n, ref)), e2 = cross3(n, e1);
  const pts: P2[] = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    pts.push(PROJECT[view](add3(c, add3(mul3(e1, Math.cos(t) * r), mul3(e2, Math.sin(t) * r)))));
  }
  out.push({ kind: "poly", layer, pts, closed: true });
}

function drawFrame(view: ViewKind, frame: WheelchairFrame): Entity[] {
  const out: Entity[] = [];
  for (const p of frame.pipes) tube(out, view, p.a, p.b, p.r, "FRAME", true);
  const jr = FRAME_SPEC.jointDiameter / 2;
  for (const j of frame.joints) {
    for (const d of j.dirs) tube(out, view, j.center, add3(j.center, mul3(norm3(d), jr)), JOINT_OUTER_R, "JOINT", false);
  }
  for (const a of frame.axles) tube(out, view, a.a, a.b, FRAME_SPEC.axleDiameter / 2, "WHEEL", false);
  // 車輪: タイヤの両側面とハブ
  const R = frame.wheelDiameter / 2;
  for (const w of frame.wheels) {
    const half = FRAME_SPEC.wheelWidth / 2;
    circle3(out, view, add3(w.center, mul3(w.axis, half)), w.axis, R, "WHEEL");
    circle3(out, view, add3(w.center, mul3(w.axis, -half)), w.axis, R, "WHEEL");
    circle3(out, view, add3(w.center, mul3(w.axis, FRAME_SPEC.hubWidth / 2)), w.axis, FRAME_SPEC.hubDiameter / 2, "WHEEL");
  }
  return out;
}

// ── 寸法線 ──────────────────────────────────────────────────
const fmtMm = (v: number) => v.toFixed(1);

// p1→p2 の寸法。dir = "h" は横方向の長さ、"v" は縦方向の長さ、"a" は2点を結ぶ長さ。
// at は寸法線の位置（h なら v 座標、v なら u 座標、a なら2点からのずらし量）
function dim(out: Entity[], p1: P2, p2: P2, dir: "h" | "v" | "a", at: number, label?: string) {
  let q1: P2, q2: P2;
  if (dir === "h") { q1 = [p1[0], at]; q2 = [p2[0], at]; }
  else if (dir === "v") { q1 = [at, p1[1]]; q2 = [at, p2[1]]; }
  else {
    const d = sub2(p2, p1); const l = len2(d);
    const n: P2 = [-d[1] / l, d[0] / l];
    q1 = add2(p1, mul2(n, at)); q2 = add2(p2, mul2(n, at));
  }
  const d = sub2(q2, q1); const l = len2(d);
  if (l < 0.5) return;
  const u: P2 = mul2(d, 1 / l);
  // 補助線（形から寸法線の少し先まで）
  for (const [p, q] of [[p1, q1], [p2, q2]] as const) {
    const e = sub2(q, p); const el = len2(e);
    if (el > 0.5) out.push({ kind: "line", layer: "DIM", a: add2(p, mul2(e, 1.5 / el)), b: add2(q, mul2(e, 2 / el)) });
  }
  out.push({ kind: "line", layer: "DIM", a: q1, b: q2 });
  // 端の斜線（建築式）
  const t: P2 = mul2(add2(u, [-u[1], u[0]]), TICK / Math.SQRT2);
  for (const q of [q1, q2]) out.push({ kind: "line", layer: "DIM", a: sub2(q, t), b: add2(q, t) });
  // 文字は寸法線の中央・上側。読める向き（-90°〜90°）にそろえる
  let rot = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  if (rot > 90.01) rot -= 180;
  if (rot < -89.99) rot += 180;
  const r = (rot * Math.PI) / 180;
  const up: P2 = [-Math.sin(r), Math.cos(r)];
  const mid = mul2(add2(q1, q2), 0.5);
  out.push({ kind: "text", layer: "DIM", p: add2(mid, mul2(up, 1.5)), h: TEXT_H, text: label ?? fmtMm(l), rot });
}

function note(out: Entity[], p: P2, text: string, h = TEXT_H) {
  out.push({ kind: "text", layer: "TEXT", p, h, text, rot: 0 });
}

function bbox(es: Entity[]): { min: P2; max: P2 } {
  let min: P2 = [Infinity, Infinity], max: P2 = [-Infinity, -Infinity];
  const take = (p: P2) => { min = [Math.min(min[0], p[0]), Math.min(min[1], p[1])]; max = [Math.max(max[0], p[0]), Math.max(max[1], p[1])]; };
  for (const e of es) {
    if (e.kind === "line") { take(e.a); take(e.b); }
    else if (e.kind === "circle") { take([e.c[0] - e.r, e.c[1] - e.r]); take([e.c[0] + e.r, e.c[1] + e.r]); }
    else if (e.kind === "poly") e.pts.forEach(take);
    else { take(e.p); take([e.p[0] + e.text.length * e.h * 0.35, e.p[1] + e.h]); take([e.p[0] - e.text.length * e.h * 0.35, e.p[1]]); }
  }
  return { min, max };
}

const translate = (es: Entity[], o: P2): Entity[] => es.map(e => {
  if (e.kind === "line") return { ...e, a: add2(e.a, o), b: add2(e.b, o) };
  if (e.kind === "circle") return { ...e, c: add2(e.c, o) };
  if (e.kind === "poly") return { ...e, pts: e.pts.map(p => add2(p, o)) };
  return { ...e, p: add2(e.p, o) };
});

// ── 各図 ────────────────────────────────────────────────────

function sideView(frame: WheelchairFrame): Entity[] {
  const P = PROJECT.side;
  const out = drawFrame("side", frame);
  const L = frame.sides[0];
  const shape = bbox(out);
  const base = P(L.base), front = P(L.front), rear = P(L.rear);
  const ground = 0;
  // 地面
  out.push({ kind: "line", layer: "CENTER", a: [shape.min[0] - 10, ground], b: [shape.max[0] + 10, ground] });
  // 上: 前方フレーム長・後方フレーム長、その上に全長
  const top = shape.max[1] + DIM_GAP;
  dim(out, front, base, "h", top);
  dim(out, base, rear, "h", top);
  dim(out, front, rear, "h", top + DIM_STEP);
  // 後ろ: フレーム高さ（地面〜上フレーム）
  dim(out, [base[0], ground], base, "v", shape.max[0] + DIM_GAP);
  // 車輪中心の高さと車輪径
  const w = frame.wheels[0];
  const wc = P(w.center);
  dim(out, [wc[0], ground], wc, "v", shape.min[0] - DIM_GAP, `${fmtMm(w.center[2] * MM)}`);
  note(out, [wc[0], ground - TEXT_H * 2.2], `WHEEL D${fmtMm(frame.wheelDiameter * MM)} x W${fmtMm(FRAME_SPEC.wheelWidth * MM)}`);
  return out;
}

function planView(frame: WheelchairFrame): Entity[] {
  const P = PROJECT.plan;
  const out = drawFrame("plan", frame);
  const [L, R] = frame.sides;
  const shape = bbox(out);
  // 前: フレーム幅（上フレームどうし）と車輪の外幅
  dim(out, P(L.front), P(R.front), "v", shape.min[0] - DIM_GAP);
  dim(out, [shape.min[0], shape.min[1]], [shape.min[0], shape.max[1]], "v", shape.min[0] - DIM_GAP - DIM_STEP * 2,
    `${fmtMm(shape.max[1] - shape.min[1])} (OVERALL)`);
  // 下: 全長
  dim(out, P(L.front), P(L.rear), "h", shape.min[1] - DIM_GAP);
  return out;
}

function frontView(frame: WheelchairFrame): Entity[] {
  const P = PROJECT.front;
  const out = drawFrame("front", frame);
  const [L, R] = frame.sides;
  const shape = bbox(out);
  out.push({ kind: "line", layer: "CENTER", a: [shape.min[0] - 10, 0], b: [shape.max[0] + 10, 0] });
  // 上: フレーム幅
  dim(out, P(L.base), P(R.base), "h", shape.max[1] + DIM_GAP);
  // 下: 垂直材の下端どうしの幅、車輪の外幅
  dim(out, P(L.bottom), P(R.bottom), "h", -DIM_GAP - TEXT_H);
  dim(out, [shape.min[0], 0], [shape.max[0], 0], "h", -DIM_GAP - TEXT_H - DIM_STEP, `${fmtMm(shape.max[0] - shape.min[0])} (OVERALL)`);
  // 垂直材（斜め）の長さと、下端から横フレームまでの長さ。どちらも外側に出す
  const midU = (shape.min[0] + shape.max[0]) / 2;
  const outward = (p1: P2, p2: P2, off: number) => {
    const d = sub2(p2, p1);
    const n: P2 = [-d[1], d[0]];
    return (p1[0] - midU) * n[0] >= 0 ? off : -off;
  };
  const sideA = P(frame.sides[0].bottom)[0] < midU ? L : R; // 図の左側の垂直材
  const sideB = sideA === L ? R : L;
  const [ab, at] = [P(sideA.bottom), P(sideA.base)];
  dim(out, ab, at, "a", outward(ab, at, DIM_GAP + 8), `${fmtMm(frame.verticalLength * MM)} (VERTICAL)`);
  const [bb, bc] = [P(sideB.bottom), P(sideB.cross)];
  dim(out, bb, bc, "a", outward(bb, bc, DIM_GAP + 8), `${fmtMm(Math.hypot(...sideB.cross.map((v, i) => v - sideB.bottom[i])) * MM)} (CROSS)`);
  // 開き角は図の内側、上フレームの少し下に
  note(out, [midU, P(L.base)[1] - 35], `OPEN ${FRAME_SPEC.openAngle} DEG (EACH SIDE)`);
  return out;
}

// ── DXF ─────────────────────────────────────────────────────

export type DxfOptions = { title?: string; date?: string };

export function wheelchairDxf(frame: WheelchairFrame, opts: DxfOptions = {}): string {
  const titled = (es: Entity[], title: string) => {
    const b = bbox(es);
    return [...es, { kind: "text" as const, layer: "TEXT" as const, p: [(b.min[0] + b.max[0]) / 2, b.min[1] - TITLE_H * 2] as P2, h: TITLE_H, text: title, rot: 0 }];
  };
  const side = titled(sideView(frame), "SIDE VIEW");
  const plan = titled(planView(frame), "PLAN VIEW");
  const front = titled(frontView(frame), "FRONT VIEW");

  // 配置: 側面図の下に平面図（前後方向をそろえる）、側面図の右に正面図（高さをそろえる）
  const sb = bbox(side), pb = bbox(plan), fb = bbox(front);
  const sideT = translate(side, [0, 0]);
  const planT = translate(plan, [0, sb.min[1] - VIEW_GAP - pb.max[1]]);
  const frontT = translate(front, [sb.max[0] + VIEW_GAP - fb.min[0], 0]);
  const all = [...sideT, ...planT, ...frontT];
  const ab = bbox(all);
  const info = [
    opts.title ?? "DOG WHEELCHAIR (REAR SUPPORT, 2 WHEELS)",
    `UNIT: mm   SCALE 1:1${opts.date ? `   DATE: ${opts.date}` : ""}`,
    `PIPE OD ${FRAME_SPEC.frameOuterR * 2 * MM} / ${FRAME_SPEC.crossOuterR * 2 * MM}   JOINT D${FRAME_SPEC.jointDiameter * MM}   ` +
      `OPEN ${FRAME_SPEC.openAngle} DEG   BRACE ${FRAME_SPEC.braceAngle} DEG`,
  ];
  // 図の情報（左下に左揃え。toDxf には末尾の何個が左揃えかを渡す）
  info.forEach((t, i) => all.push({ kind: "text", layer: "TEXT", p: [ab.min[0], ab.min[1] - 20 - i * TEXT_H * 2], h: i === 0 ? TITLE_H : TEXT_H, text: t, rot: 0 }));
  return toDxf(all, info.length);
}

function toDxf(entities: Entity[], leftAligned: number): string {
  const L: (string | number)[] = [];
  const g = (code: number, value: string | number) => {
    L.push(code, typeof value === "number" ? Number(value.toFixed(4)) : value);
  };
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$INSUNITS"); g(70, 4); // mm
  g(0, "ENDSEC");

  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 1);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0);
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, Object.keys(LAYERS).length);
  for (const [name, color] of Object.entries(LAYERS)) {
    g(0, "LAYER"); g(2, name); g(70, 0); g(62, color); g(6, "CONTINUOUS");
  }
  g(0, "ENDTAB");
  g(0, "ENDSEC");

  g(0, "SECTION"); g(2, "ENTITIES");
  const firstLeft = entities.length - leftAligned;
  entities.forEach((e, i) => {
    if (e.kind === "line") {
      g(0, "LINE"); g(8, e.layer);
      g(10, e.a[0]); g(20, e.a[1]); g(30, 0); g(11, e.b[0]); g(21, e.b[1]); g(31, 0);
    } else if (e.kind === "circle") {
      g(0, "CIRCLE"); g(8, e.layer); g(10, e.c[0]); g(20, e.c[1]); g(30, 0); g(40, e.r);
    } else if (e.kind === "poly") {
      g(0, "POLYLINE"); g(8, e.layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, e.closed ? 1 : 0);
      for (const p of e.pts) { g(0, "VERTEX"); g(8, e.layer); g(10, p[0]); g(20, p[1]); g(30, 0); }
      g(0, "SEQEND"); g(8, e.layer);
    } else {
      g(0, "TEXT"); g(8, e.layer);
      g(10, e.p[0]); g(20, e.p[1]); g(30, 0); g(40, e.h); g(1, e.text);
      if (e.rot) g(50, e.rot);
      if (i < firstLeft) {
        // 下側中央揃え（72=1: 中央、73 は R12 では使わないので基準線中央）
        g(72, 1); g(11, e.p[0]); g(21, e.p[1]); g(31, 0);
      }
    }
  });
  g(0, "ENDSEC");
  g(0, "EOF");
  return L.join("\r\n") + "\r\n";
}
