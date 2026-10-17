import type { Keypoint3D } from "@/types";
import { computeBodyMetrics, METRIC_LABELS } from "@/lib/body-metrics";
import { keypointStatus } from "@/lib/coords-3d";

// 後脚サポート型（2輪）車椅子。frontend/txt（Rhino / Grasshopper のフレームモデル）を移植したもの。
// 寸法の主要パラメータは採寸値から自動で決め、項目ごとに手入力で上書きできる。
// 単位はすべて cm（元のモデルは mm）

// ── 採寸値から決める主要パラメータ ─────────────────────────────

export type WheelchairKey = "frameHeight" | "frontLength" | "rearLength" | "frameWidth" | "wheelDiameter" | "crossHeight";

export const WHEELCHAIR_KEYS: WheelchairKey[] = [
  "frameHeight", "frontLength", "rearLength", "frameWidth", "wheelDiameter", "crossHeight",
];

// 腰の左右に空ける隙間（片側）
export const SIDE_CLEARANCE_CM = 2;
// 元モデルの既定値（高さ 300mm に車輪径 150mm）の比率
const WHEEL_TO_HEIGHT = 0.5;
// 尻の点がないときの後方フレーム長
const DEFAULT_REAR_LENGTH = 10;

export const WHEELCHAIR_DEFS: Record<WheelchairKey, { title: string; note: string; missing: string }> = {
  frameHeight: {
    title: "フレーム高さ", note: "地面〜上フレーム（肩甲骨上端と胸骨下部の高さの平均）",
    missing: "肩甲骨上端と胸骨下部に点を配置してください",
  },
  frontLength: {
    title: "前方フレーム長", note: "支柱〜前端（後足の付け根から胸部まで）",
    missing: "胸部と後足の付け根に点を配置してください",
  },
  rearLength: {
    title: "後方フレーム長", note: "支柱〜後端（尻まで）",
    missing: "後足の付け根に点を配置してください",
  },
  frameWidth: {
    title: "フレーム幅", note: `左右の後足付け根の幅 + 片側 ${SIDE_CLEARANCE_CM} cm`,
    missing: "左右の後足付け根を真上の写真にも配置してください",
  },
  wheelDiameter: {
    title: "車輪径", note: "フレーム高さの半分",
    missing: "肩甲骨上端と胸骨下部に点を配置してください",
  },
  crossHeight: {
    title: "横フレーム高さ", note: "垂直材の下端から、左右の垂直材をつなぐ横フレームまで（垂直材に沿って）",
    missing: "肩甲骨上端と胸骨下部に点を配置してください",
  },
};

export type WheelchairValues = Record<WheelchairKey, number | null>;

// measurement_sessions.wheelchair_design（jsonb）の中身: 手入力で上書きした値だけを持つ
export type WheelchairDesign = Partial<Record<WheelchairKey, number | null>>;

// 採寸値からの推定値
export function estimateWheelchair(keypoints: Keypoint3D[]): WheelchairValues {
  const m = computeBodyMetrics(keypoints);
  const { hindBaseMid } = m.anchors;
  const complete = (label: string) => keypoints.find(p => p.label === label && keypointStatus(p).complete) ?? null;

  const ry = complete(METRIC_LABELS.rightHindBase)?.y_cm ?? null;
  const ly = complete(METRIC_LABELS.leftHindBase)?.y_cm ?? null;
  const hip = complete("尻");
  const chest = complete("胸部");
  const scapula = complete("肩甲骨上端");
  const sternum = complete("胸骨下部");

  // 上フレームは胴の高さ（背中の肩甲骨上端と腹側の胸骨下部の中間）を通す
  const height = m.groundZ != null && scapula && sternum
    ? (scapula.z_cm! + sternum.z_cm!) / 2 - m.groundZ
    : null;
  return {
    frameHeight: height,
    frontLength: chest && hindBaseMid ? Math.abs(chest.x_cm! - hindBaseMid.x) : null,
    rearLength: hindBaseMid ? (hip ? Math.abs(hip.x_cm! - hindBaseMid.x) : DEFAULT_REAR_LENGTH) : null,
    frameWidth: ry != null && ly != null ? Math.abs(ry - ly) + SIDE_CLEARANCE_CM * 2 : null,
    wheelDiameter: height != null ? height * WHEEL_TO_HEIGHT : null,
    crossHeight: height != null ? defaultCrossHeight(verticalLengthFor(height, height * WHEEL_TO_HEIGHT)) : null,
  };
}

// 手入力があればそれ、なければ推定値。
// 車輪径と横フレーム高さの自動値は他の寸法から決まるので、フレーム高さ・車輪径を手で変えたらそれに合わせて計算し直す
export function resolveWheelchair(estimated: WheelchairValues, design: WheelchairDesign | null | undefined): WheelchairValues {
  const out = { ...estimated };
  const manual = (k: WheelchairKey) => { const v = design?.[k]; return v != null && v > 0 ? v : null; };
  for (const k of WHEELCHAIR_KEYS) {
    const v = manual(k);
    if (v != null) out[k] = v;
  }
  if (manual("wheelDiameter") == null && out.frameHeight != null) out.wheelDiameter = out.frameHeight * WHEEL_TO_HEIGHT;
  if (manual("crossHeight") == null && out.frameHeight != null && out.wheelDiameter != null) {
    out.crossHeight = defaultCrossHeight(verticalLengthFor(out.frameHeight, out.wheelDiameter));
  }
  return out;
}

// 垂直材長: 開いたフレームに付けた車輪がちょうど地面に接する長さ（元モデルの calculate_vertical_length）
export function verticalLengthFor(height: number, wheelDiameter: number): number {
  const S = FRAME_SPEC;
  const open = (S.openAngle * Math.PI) / 180;
  const c = Math.cos(open), s = Math.abs(Math.sin(open));
  const tireExtent = (wheelDiameter / 2) * c + (S.wheelWidth / 2) * s;
  const wheelYOffset = S.wheelGap + S.wheelWidth / 2;
  return (height + wheelYOffset * s - tireExtent) / c + S.wheelOffsetZ;
}

// 小型犬では元モデルの固定値（補強材下端 6cm / 横フレーム 15cm）が垂直材に収まらないので、垂直材に対する比率で縮める
const braceBottomFor = (verticalLength: number) => Math.min(FRAME_SPEC.braceBottomHeight, verticalLength * 0.24);
const defaultCrossHeight = (verticalLength: number) => Math.min(FRAME_SPEC.crossHeight, verticalLength * 0.59);

// ── 元モデルの固定パラメータ（mm → cm） ─────────────────────────

export const FRAME_SPEC = {
  openAngle: 15,          // 左右それぞれの開き角度（deg）
  braceAngle: 45,         // 補助斜め材の角度（deg）
  braceBottomHeight: 6,   // 補助斜め材の下端（垂直材の下端から）
  crossHeight: 15,        // 垂直材に追加する横フレーム（垂直材の下端から）
  frameOuterR: 1.0, frameInnerR: 0.6,   // 側面フレームのパイプ
  crossOuterR: 0.8, crossInnerR: 0.6,   // 横フレームのパイプ
  jointDiameter: 9,
  jointClearance: 0.02,   // パイプとジョイントの半径方向クリアランス
  jointWall: 0.2,         // ジョイント肉厚
  jointInsertDepth: 2.0,  // 中空ジョイントへの差し込み長
  elbowBendRadius: 1.8,   // L字エルボの標準曲がり半径
  elbowRadiusClearance: 0.1,
  angleTol: 1,            // 直角とみなす角度の許容（deg）
  wheelWidth: 2,
  wheelOffsetZ: 2.2,      // 垂直材の下端から車輪中心まで
  wheelGap: 1.5,          // フレームから車輪の内側まで
  tireDepth: 1.8,
  rimWidth: 1.5, rimThickness: 0.5,  // リム幅はタイヤ幅より狭く（元モデルは 30mm / タイヤ 40mm）
  hubDiameter: 4.5, hubWidth: 2.25, axleDiameter: 1.0,  // ハブ幅はタイヤ幅に合わせる（元モデルの比率 45mm / 40mm）
  spokeCount: 5, spokeBaseWidth: 2.0, spokeTipWidth: 1.2, spokeDepth: 1.2,
} as const;

const JOINT_R = FRAME_SPEC.jointDiameter / 2;
// ジョイントの内半径（太い方のパイプ + クリアランス）と外半径（+ 肉厚）
export const JOINT_INNER_R = Math.max(FRAME_SPEC.frameOuterR, FRAME_SPEC.crossOuterR) + FRAME_SPEC.jointClearance;
export const JOINT_OUTER_R = JOINT_INNER_R + FRAME_SPEC.jointWall;
// エルボの曲がり半径はジョイントの外半径に追従
export const ELBOW_BEND_R = Math.max(FRAME_SPEC.elbowBendRadius, JOINT_OUTER_R + FRAME_SPEC.elbowRadiusClearance);

// ── フレームの形（元モデルの座標系: X=前+、Y=右+（左が -）、Z=上、地面 Z=0、支柱上端の中点が原点の真上） ──

export type V3 = [number, number, number];

export type FramePipe = { a: V3; b: V3; r: number; kind: "frame" | "cross" };
export type FrameJoint = { center: V3; dirs: V3[] };
export type FrameWheel = { center: V3; axis: V3 }; // axis = 車軸方向（単位ベクトル、外向き）

// ── 部材一覧（元モデルのパイプ切断長管理・ジョイント） ───────────────

// 端部の接続: 中空ジョイント（差し込み）／二重ジョイント（突き当て）／ジョイントなし
export type EndType = "hollow" | "double" | "free";
export const END_TYPE_LABELS: Record<EndType, string> = { hollow: "中空", double: "二重", free: "なし" };

export type PipeRecord = {
  id: string;            // 元モデルの部材名（CSV 用。左右は L_ / R_ を付けて出す）
  name: string;
  count: number;         // 左右で同じ寸法なら 2
  outerR: number;
  innerR: number;
  centerLength: number;  // ジョイント中心どうしの長さ
  type1: EndType;
  type2: EndType;
  insert1: number;       // 差し込み長（中空の端だけ）
  insert2: number;
  cutLength: number;     // 切断長 = 芯々長 − 両端の控え
};

export type JointRecord = {
  name: string;
  kind: "T" | "L";
  type: "hollow" | "double";  // 直角なら中空、それ以外は二重（内外を別部品で作る）
  angle: number;              // 主管と枝管の角度（deg）
  count: number;
};

export type WheelchairFrame = {
  pipes: FramePipe[];
  joints: FrameJoint[];
  wheels: FrameWheel[];
  axles: { a: V3; b: V3 }[];
  pipeRecords: PipeRecord[];
  jointRecords: JointRecord[];
  totalPipeLength: number;
  verticalLength: number;
  wheelDiameter: number;
  warnings: string[];
};

const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const scale = (p: V3, s: number): V3 => [p[0] * s, p[1] * s, p[2] * s];
const unit = (p: V3): V3 => { const l = Math.hypot(...p) || 1; return scale(p, 1 / l); };

// X 軸まわりの回転（右手系。元モデルの make_x_rotation と同じ向き）
function rotX(v: V3, deg: number): V3 {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
const rotAbout = (p: V3, pivot: V3, deg: number): V3 => add(pivot, rotX(sub(p, pivot), deg));
const dist = (p: V3, q: V3) => Math.hypot(...sub(p, q));
const angleDeg = (p: V3, q: V3) => {
  const a = unit(p), b = unit(q);
  return (Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
};
const jointType = (angle: number) =>
  Math.abs(angle - 90) <= FRAME_SPEC.angleTol ? "hollow" as const : "double" as const;

// 端部の控え（ジョイント中心からパイプ端まで）
function endOffset(t: EndType): number {
  if (t === "hollow") return JOINT_R - FRAME_SPEC.jointInsertDepth;
  if (t === "double") return JOINT_R;
  return 0;
}

function pipeRecord(
  id: string, name: string, count: number, a: V3, b: V3, type1: EndType, type2: EndType, outerR: number, innerR: number,
): PipeRecord {
  const centerLength = dist(a, b);
  const insert = (t: EndType) => (t === "hollow" ? FRAME_SPEC.jointInsertDepth : 0);
  return {
    id, name, count, outerR, innerR, centerLength, type1, type2,
    insert1: insert(type1), insert2: insert(type2),
    cutLength: centerLength - endOffset(type1) - endOffset(type2),
  };
}

export function buildWheelchairFrame(v: WheelchairValues): WheelchairFrame | null {
  const { frameHeight: height, frontLength, rearLength, frameWidth: width, wheelDiameter } = v;
  if (height == null || frontLength == null || rearLength == null || width == null || wheelDiameter == null) return null;
  const S = FRAME_SPEC;

  const verticalLength = verticalLengthFor(height, wheelDiameter);
  const wheelYOffset = S.wheelGap + S.wheelWidth / 2;
  const braceBottom = braceBottomFor(verticalLength);
  const crossHeight = v.crossHeight ?? defaultCrossHeight(verticalLength);
  const braceStartX = (verticalLength - braceBottom) / Math.tan((S.braceAngle * Math.PI) / 180);

  const warnings: string[] = [];
  if (verticalLength <= 0) warnings.push("車輪径がフレーム高さに対して大きすぎます");
  if (width <= S.jointDiameter) warnings.push(`フレーム幅はジョイント径 ${S.jointDiameter} cm より広くしてください`);
  if (rearLength <= S.jointDiameter) warnings.push(`後方フレーム長はジョイント径 ${S.jointDiameter} cm より長くしてください`);
  // 横フレームは垂直材の範囲内で、補強材の下側ジョイント・上部ジョイントと重ならない位置に
  if (crossHeight < 0 || crossHeight > verticalLength) {
    warnings.push(`横フレーム高さは垂直材の長さ（${verticalLength.toFixed(1)} cm）以内にしてください`);
  } else if (Math.abs(crossHeight - braceBottom) < JOINT_R) {
    warnings.push(`横フレームが補強材の下側ジョイント（下端から ${braceBottom.toFixed(1)} cm）に近すぎます`);
  } else if (verticalLength - crossHeight < JOINT_R) {
    warnings.push("横フレームが上部ジョイントに近すぎます");
  }
  if (frontLength <= braceStartX + JOINT_R) {
    warnings.push(`前方フレーム長は補強材の取り付け位置より長く（${(braceStartX + JOINT_R).toFixed(1)} cm 超）してください`);
  }
  if (verticalLength <= 0) {
    return { pipes: [], joints: [], wheels: [], axles: [], pipeRecords: [], jointRecords: [], totalPipeLength: 0,
             verticalLength, wheelDiameter, warnings };
  }

  const pipes: FramePipe[] = [];
  const joints: FrameJoint[] = [];
  const wheels: FrameWheel[] = [];
  const axles: { a: V3; b: V3 }[] = [];
  const rears: V3[] = [];
  const crosses: V3[] = [];
  let sideRecords: PipeRecord[] = [];
  let sideJoints: JointRecord[] = [];

  // 左右の側面フレーム。左（Y-）は -開き角、右（Y+）は +開き角で X 軸まわりに回して外へ開く
  for (const side of [-1, 1] as const) {
    const base: V3 = [0, (side * width) / 2, height];
    const angle = side * S.openAngle;
    const R = (p: V3) => rotAbout(p, base, angle);
    const Rd = (d: V3) => rotX(d, angle);

    const rear: V3 = [-rearLength, base[1], height];
    const front: V3 = [frontLength, base[1], height];
    const bottom: V3 = [0, base[1], height - verticalLength];
    const braceStart: V3 = [braceStartX, base[1], height];
    const braceEnd: V3 = [0, base[1], bottom[2] + braceBottom];
    const cross: V3 = [0, base[1], bottom[2] + crossHeight];

    pipes.push(
      { a: R(rear), b: R(front), r: S.frameOuterR, kind: "frame" },        // 上フレーム（後端〜前端）
      { a: R(base), b: R(bottom), r: S.frameOuterR, kind: "frame" },       // 垂直材
      { a: R(braceStart), b: R(braceEnd), r: S.frameOuterR, kind: "frame" }, // 45° 補強
    );

    const toBrace = unit(sub(braceEnd, braceStart));
    joints.push(
      { center: R(base), dirs: [Rd([1, 0, 0]), Rd([-1, 0, 0]), Rd([0, 0, -1])] },
      { center: R(braceStart), dirs: [Rd([1, 0, 0]), Rd([-1, 0, 0]), Rd(toBrace)] },
      { center: R(braceEnd), dirs: [Rd([0, 0, 1]), Rd([0, 0, -1]), Rd(scale(toBrace, -1))] },
    );

    // 車輪: 垂直材の下端から外側・少し上。フレームと一緒に傾く（キャンバー）
    const wheelCenterLocal: V3 = [0, bottom[1] + side * wheelYOffset, bottom[2] + S.wheelOffsetZ];
    const wheelCenter = R(wheelCenterLocal);
    wheels.push({ center: wheelCenter, axis: Rd([0, side, 0]) });
    axles.push({
      a: R([0, bottom[1], wheelCenterLocal[2]]),
      b: R([0, wheelCenterLocal[1] + (side * S.hubWidth) / 2, wheelCenterLocal[2]]),
    });

    rears.push(R(rear));
    crosses.push(R(cross));

    // 部材一覧（回転しても長さ・角度は変わらないので、回転前の座標で左右1回だけ計算する）
    if (side === -1) {
      const tTop = jointType(angleDeg([1, 0, 0], [0, 0, -1]));
      const tFront = jointType(angleDeg([1, 0, 0], toBrace));
      const tLower = jointType(angleDeg([0, 0, 1], scale(toBrace, -1)));
      sideJoints = [
        { name: "上部T字（支柱上）", kind: "T", type: tTop, angle: angleDeg([1, 0, 0], [0, 0, -1]), count: 2 },
        { name: "補強材・前T字", kind: "T", type: tFront, angle: angleDeg([1, 0, 0], toBrace), count: 2 },
        { name: "補強材・下T字", kind: "T", type: tLower, angle: angleDeg([0, 0, 1], scale(toBrace, -1)), count: 2 },
      ];
      const fr = [S.frameOuterR, S.frameInnerR] as const;
      sideRecords = [
        pipeRecord("horizontal_middle", "上フレーム中央（補強材〜支柱）", 2, braceStart, base, tFront, tTop, ...fr),
        pipeRecord("vertical_middle", "垂直材上部（支柱〜補強材）", 2, base, braceEnd, tTop, tLower, ...fr),
        pipeRecord("diagonal", "補強材（45°）", 2, braceStart, braceEnd, tFront, tLower, ...fr),
        pipeRecord("horizontal_front", "上フレーム前部（補強材〜前端）", 2, braceStart, front, tFront, "free", ...fr),
        pipeRecord("horizontal_rear", "上フレーム後部（支柱〜後端）", 2, base, rear, tTop, "hollow", ...fr),
        pipeRecord("vertical_lower", "垂直材下部（補強材〜下端）", 2, braceEnd, bottom, tLower, "free", ...fr),
      ];
    }
  }

  // 後端の横フレーム（両端は L 字エルボ）と、垂直材どうしをつなぐ横フレーム
  pipes.push(
    { a: rears[0], b: rears[1], r: S.crossOuterR, kind: "cross" },
    { a: crosses[0], b: crosses[1], r: S.crossOuterR, kind: "cross" },
  );
  joints.push(
    { center: rears[0], dirs: [[1, 0, 0], unit(sub(rears[1], rears[0]))] },
    { center: rears[1], dirs: [[1, 0, 0], unit(sub(rears[0], rears[1]))] },
  );

  const elbowAngle = angleDeg([1, 0, 0], sub(rears[1], rears[0]));
  const cr = [S.crossOuterR, S.crossInnerR] as const;
  const pipeRecords = [
    ...sideRecords,
    pipeRecord("rear_cross", "後端横フレーム", 1, rears[0], rears[1], "hollow", "hollow", ...cr),
    pipeRecord("vertical_cross", "垂直材横フレーム（ジョイントなし）", 1, crosses[0], crosses[1], "free", "free", ...cr),
  ];
  const jointRecords: JointRecord[] = [
    ...sideJoints,
    { name: "後端L字エルボ", kind: "L", type: jointType(elbowAngle), angle: elbowAngle, count: 2 },
  ];
  for (const r of pipeRecords) if (r.cutLength <= 0) warnings.push(`パイプが短すぎます: ${r.name}`);
  const totalPipeLength = pipeRecords.reduce((a, r) => a + r.cutLength * r.count, 0);

  return { pipes, joints, wheels, axles, pipeRecords, jointRecords, totalPipeLength, verticalLength, wheelDiameter, warnings };
}

// 元モデルの csv_text と同じ形式（左右の部材は L_ / R_ に分けて1行ずつ、mm）
export function pipeRecordsCsv(records: PipeRecord[]): string {
  const rows = records.flatMap(r =>
    r.count === 2 ? [{ ...r, id: `L_${r.id}` }, { ...r, id: `R_${r.id}` }] : [r]
  );
  // 元モデルと同じ並び（左フレーム → 右フレーム → 横フレーム）
  rows.sort((a, b) => order(a.id) - order(b.id));
  const mm = (cm: number) => (cm * 10).toFixed(3);
  return [
    "No,Name,CenterLength_mm,End1Type,End2Type,Insert1_mm,Insert2_mm,CutLength_mm",
    ...rows.map((r, i) => [i + 1, r.id, mm(r.centerLength), r.type1, r.type2, mm(r.insert1), mm(r.insert2), mm(r.cutLength)].join(",")),
  ].join("\n");
}
const order = (id: string) => (id.startsWith("L_") ? 0 : id.startsWith("R_") ? 1 : 2);

// ── 犬の位置に合わせる ──────────────────────────────────────

// 3D に重ねて描くための配置（DB 座標系）。フレームの原点（支柱の中点・地面）を後足付け根の真下に置く
export type WheelchairPlacement = {
  frame: WheelchairFrame;
  originX: number;
  originY: number;
  groundZ: number;
  forward: 1 | -1;  // 犬の前が +X なら 1
};

export function placeWheelchair(keypoints: Keypoint3D[], v: WheelchairValues): WheelchairPlacement | null {
  const m = computeBodyMetrics(keypoints);
  const { frontBaseMid, hindBaseMid } = m.anchors;
  if (m.groundZ == null || !hindBaseMid) return null;
  const frame = buildWheelchairFrame(v);
  if (!frame) return null;
  return {
    frame,
    originX: hindBaseMid.x,
    originY: hindBaseMid.y,
    groundZ: m.groundZ,
    forward: frontBaseMid && frontBaseMid.x < hindBaseMid.x ? -1 : 1,
  };
}

// フレーム座標 → DB 座標
export function frameToDb(p: WheelchairPlacement, q: V3): V3 {
  return [p.originX + p.forward * q[0], p.originY + q[1], p.groundZ + q[2]];
}
