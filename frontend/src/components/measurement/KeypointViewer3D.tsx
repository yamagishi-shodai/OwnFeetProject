"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type { Keypoint3D } from "@/types";
import { keypointStatus, midlineY } from "@/lib/coords-3d";
import { computeBodyMetrics, type BodyMetrics, type MetricKey } from "@/lib/body-metrics";

// ── 犬の骨格ライン定義 ─────────────────────────────────────────
const SKELETON_EDGES: [string, string][] = [
  ["頭頂", "鼻先"],
  ["頭頂", "肩甲骨上端"],
  ["鼻先", "喉元"],
  ["喉元", "胸部"],
  ["胸部", "胸骨下部"],
  ["胸骨下部", "右後足付け根"],
  ["胸骨下部", "左後足付け根"],
  ["肩甲骨上端", "尾根"],
  ["肩甲骨上端", "右前足付け根"],
  ["肩甲骨上端", "左前足付け根"],
  ["尾根", "尻"],
  ["尻", "右後足付け根"],
  ["尻", "左後足付け根"],
  ["右前足付け根", "右前足首"],
  ["左前足付け根", "左前足首"],
  ["右後足付け根", "右後足首"],
  ["左後足付け根", "左後足首"],
];

// DB座標 (X=体長, Y=体幅, Z=高さ) → Three.js座標 (Y=上) への変換
// Three.js: X=体長, Y=高さ(Z_db), Z=体幅(Y_db)
function toThree(x: number, y: number, z: number): [number, number, number] {
  return [x, z, y]; // Three.js Y=高さ=Z_db, Three.js Z=体幅=Y_db
}

// ── 地面（XY平面 = Three.jsのXZ平面）。足先の高さに置き、面＋グリッドで描く ──────
function Ground({ center, radius, groundY }: { center: [number, number, number]; radius: number; groundY: number }) {
  const step = 10;
  // 点の広がりを覆う大きさ（10cm 単位、最低 60cm）
  const size = Math.max(60, Math.ceil((radius * 2.4) / (step * 2)) * step * 2);
  const lines: React.ReactNode[] = [];
  const halfSize = size / 2;
  const cx = center[0]; // Three.js X = 体長
  const cy = center[2]; // Three.js Z = 体幅(Y_db)
  const gy = groundY;

  for (let i = -halfSize; i <= halfSize; i += step) {
    lines.push(
      <Line key={`x${i}`}
        points={[[cx - halfSize, gy, cy + i], [cx + halfSize, gy, cy + i]]}
        color="#c8bdb0" lineWidth={0.5} />,
      <Line key={`z${i}`}
        points={[[cx + i, gy, cy - halfSize], [cx + i, gy, cy + halfSize]]}
        color="#c8bdb0" lineWidth={0.5} />
    );
  }
  return (
    <>
      {/* 地面の面。グリッド線より少し下に置いてちらつきを防ぐ */}
      <mesh position={[cx, gy - 0.05, cy]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color="#ddd3c7" side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
      {lines}
    </>
  );
}

// ── キーポイント球 ────────────────────────────────────────────
function KpSphere({ kp, selected, scale, showLabel, midY }: { kp: Keypoint3D; selected: boolean; scale: number; showLabel: boolean; midY: number }) {
  const status = keypointStatus(kp);
  const pos = toThree(kp.x_cm ?? 0, kp.y_cm ?? midY, kp.z_cm ?? 0); // 側面のみの部位は正中線上
  const color = selected ? "#D16340" : status.complete ? "#3E6954" : "#cfaa55";
  // 点群の大きさ（scale = 包む球の半径）に合わせて見た目の大きさを揃える
  const r = scale * (selected ? 0.03 : 0.024);

  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[r, 16, 16]} />
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          metalness={0}
          transparent
          opacity={status.complete ? 1 : 0.55}
        />
      </mesh>
      {/* ラベル: HTML オーバーレイ */}
      {showLabel && <Html
        center
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <span style={{
          fontSize: 11,
          fontWeight: "bold",
          color,
          background: "rgba(255,255,255,0.82)",
          padding: "1px 4px",
          borderRadius: 4,
          border: `1px solid ${color}44`,
        }}>
          {kp.label}
          {status.complete ? " ✓" : ` (${[status.x?"X":"", status.y?"Y":"", status.z?"Z":""].filter(Boolean).join("")})`}
        </span>
      </Html>}
    </group>
  );
}

// ── 骨格エッジ ────────────────────────────────────────────────
type Vec3 = [number, number, number];

// 確定点の Three.js 座標（側面のみの部位は正中線上）
function keypointPositions(keypoints: Keypoint3D[], midY: number): Map<string, Vec3> {
  return new Map(
    keypoints
      .filter(k => keypointStatus(k).complete)
      .map(k => [k.label, toThree(k.x_cm!, k.y_cm ?? midY, k.z_cm!)])
  );
}

function SkeletonEdges({ keypoints, midY }: { keypoints: Keypoint3D[]; midY: number }) {
  const pos = keypointPositions(keypoints, midY);

  return (
    <>
      {SKELETON_EDGES.map(([a, b]) => {
        const pa = pos.get(a);
        const pb = pos.get(b);
        if (!pa || !pb) return null;
        return <Line key={`${a}-${b}`} points={[pa, pb]} color="#8a7a6a" lineWidth={2} />;
      })}
    </>
  );
}

// ── ソリッド表示: 部位ごとの点を包む多角形（凸包）を半透明で描く ─────────
// 全点を1つで包むと足の間まで埋まるため、部位に分ける。足は線のまま。
// 3点の部位は三角形の面1枚、4点以上は凸包にする
const SOLID_COLOR = "#3E6954";
const SOLID_PARTS: { name: string; labels: string[] }[] = [
  {
    name: "胴体",
    labels: ["肩甲骨上端", "右前足付け根", "左前足付け根", "胸部", "胸骨下部",
             "右後足付け根", "左後足付け根", "尾根", "尻"],
  },
  { name: "頭", labels: ["頭頂", "鼻先", "喉元", "肩甲骨上端"] },
  { name: "首", labels: ["喉元", "肩甲骨上端", "胸部"] },
];

function SolidPart({ points, color, expected }: { points: Vec3[]; color: string; expected: number }) {
  // 点の座標が変わったときだけ作り直す
  const key = points.map(p => p.map(v => v.toFixed(2)).join(",")).join(";");
  const geometry = useMemo(() => {
    // 三角形の部位は3点そろったときだけ面を張る
    if (expected === 3) {
      if (points.length !== 3) return null;
      const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
      g.computeVertexNormals();
      return g;
    }
    if (points.length < 4) return null; // 立体にならない
    try {
      return new ConvexGeometry(points.map(p => new THREE.Vector3(...p)));
    } catch {
      return null; // 全点が同一平面上などで凸包が作れない
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const edges = useMemo(() => (geometry ? new THREE.EdgesGeometry(geometry) : null), [geometry]);

  useEffect(() => () => { geometry?.dispose(); edges?.dispose(); }, [geometry, edges]);

  if (!geometry || !edges) return null;
  return (
    <group>
      {/* どの部位も「面1枚分」の同じ濃さに揃える:
          - 光の当たり方で明るさが変わらない単色マテリアル
          - 立体は外向きの面だけ描く（両面だと手前と奥の2枚が重なって濃くなる）。三角形は1枚なので両面
          - 深度を書き込み、部位どうしが重なる所で奥の面が二重に重ならないようにする */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.25}
          depthWrite
          side={expected === 3 ? THREE.DoubleSide : THREE.FrontSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

function SolidBody({ keypoints, midY }: { keypoints: Keypoint3D[]; midY: number }) {
  const pos = keypointPositions(keypoints, midY);
  return (
    <>
      {SOLID_PARTS.map(part => (
        <SolidPart
          key={part.name}
          color={SOLID_COLOR}
          expected={part.labels.length}
          points={part.labels.map(l => pos.get(l)).filter((p): p is Vec3 => !!p)}
        />
      ))}
    </>
  );
}

// ── 寸法線（前足の高さ・後ろ足の高さ・前後の足の距離） ──────────────
const DIM_COLOR = "#556E97";

function DimLine({ from, to, label }: { from: [number, number, number]; to: [number, number, number]; label: string }) {
  const midPt: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  return (
    <>
      <Line points={[from, to]} color={DIM_COLOR} lineWidth={2} dashed dashSize={1.2} gapSize={0.8} />
      <Html position={midPt} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <span style={{
          fontSize: 11, fontWeight: "bold", color: "white", background: DIM_COLOR,
          padding: "1px 6px", borderRadius: 999,
        }}>
          {label}
        </span>
      </Html>
    </>
  );
}

function Dimensions({ metrics, adopted }: { metrics: BodyMetrics; adopted: MetricKey[] }) {
  const tag = (k: MetricKey) => (adopted.includes(k) ? "（実測）" : "");
  const { groundZ: gz, frontHeight, hindHeight, legDistance, anchors } = metrics;
  if (gz == null) return null;
  const { frontBaseMid, hindBaseMid, frontFootMid, hindFootMid } = anchors;
  return (
    <>
      {frontHeight && frontBaseMid && (
        <DimLine
          from={toThree(frontBaseMid.x, frontBaseMid.y, gz)}
          to={toThree(frontBaseMid.x, frontBaseMid.y, frontBaseMid.z)}
          label={`前 ${frontHeight.avg.toFixed(1)} cm${tag("frontHeight")}`}
        />
      )}
      {hindHeight && hindBaseMid && (
        <DimLine
          from={toThree(hindBaseMid.x, hindBaseMid.y, gz)}
          to={toThree(hindBaseMid.x, hindBaseMid.y, hindBaseMid.z)}
          label={`後 ${hindHeight.avg.toFixed(1)} cm${tag("hindHeight")}`}
        />
      )}
      {legDistance && frontFootMid && hindFootMid && (
        <DimLine
          // 地面上で体長方向（X）だけを測る。Y は両者の中間に揃える
          from={toThree(frontFootMid.x, (frontFootMid.y + hindFootMid.y) / 2, gz)}
          to={toThree(hindFootMid.x, (frontFootMid.y + hindFootMid.y) / 2, gz)}
          label={`前後 ${legDistance.value.toFixed(1)} cm${tag("legDistance")}`}
        />
      )}
    </>
  );
}

// ── メインシーン ──────────────────────────────────────────────
// ── 点の広がりに合わせてカメラを自動で引く ──────────────────────
// 点群を包む球（中心 center・半径 radius）が縦横どちらの画角にも収まる距離に置く
const VIEW_DIR = new THREE.Vector3(40, 30, -50).normalize(); // -Z 側から見下ろす（X+ が画面左）
const FIT_MARGIN = 1.0;

function FitCamera({ cx, cy, cz, radius }: { cx: number; cy: number; cz: number; radius: number }) {
  const get = useThree(s => s.get);
  const controlsReady = useThree(s => !!s.controls);
  const width = useThree(s => s.size.width);
  const height = useThree(s => s.size.height);

  useEffect(() => {
    // 描画サイズ確定前（0px）に計算すると距離が無限大になりカメラが NaN になる
    if (width <= 0 || height <= 0) return;
    const camera = get().camera as THREE.PerspectiveCamera;
    const controls = get().controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (width / Math.max(height, 1)));
    const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * FIT_MARGIN;
    if (!Number.isFinite(dist)) return;
    const target = new THREE.Vector3(cx, cy, cz);

    camera.position.copy(target).addScaledVector(VIEW_DIR, dist);
    camera.near = Math.max(0.1, dist / 100);
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    if (controls) { controls.target.copy(target); controls.update(); }
  }, [get, controlsReady, cx, cy, cz, radius, width, height]);

  return null;
}

function Scene({ keypoints, selectedLabel, center, radius, groundY, showLabels, metrics, midY, showSolid, adoptedMetrics }: {
  keypoints: Keypoint3D[]; selectedLabel: string; center: [number, number, number]; radius: number;
  groundY: number; showLabels: boolean; metrics: BodyMetrics | null; midY: number; showSolid: boolean;
  adoptedMetrics: MetricKey[];
}) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[20, 30, 20]} intensity={0.8} />

      <Ground center={center} radius={radius} groundY={groundY} />
      {/* XYZ 軸は地面の中心（点群の真下）に置く */}
      <axesHelper args={[Math.max(10, radius * 0.5)]} position={[center[0], groundY, center[2]]} />

      <SkeletonEdges keypoints={keypoints} midY={midY} />
      {showSolid && <SolidBody keypoints={keypoints} midY={midY} />}
      {metrics && <Dimensions metrics={metrics} adopted={adoptedMetrics} />}

      {keypoints.map(kp => (
        <KpSphere key={kp.id} kp={kp} selected={kp.label === selectedLabel} scale={radius} showLabel={showLabels} midY={midY} />
      ))}

      <OrbitControls
        makeDefault
        minDistance={radius * 0.3}
        maxDistance={radius * 15}
      />
      <FitCamera cx={center[0]} cy={center[1]} cz={center[2]} radius={radius} />

      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport
          axisColors={["#556E97", "#3E6954", "#D16340"]}
          labelColor="white"
        />
      </GizmoHelper>
    </>
  );
}

// ── エクスポート ──────────────────────────────────────────────
type Props = {
  keypoints: Keypoint3D[];
  selectedLabel: string;
  className?: string;
  style?: React.CSSProperties;
  // 実測値に合わせて補正済みの採寸値（寸法線に「（実測）」を付ける）
  adoptedMetrics?: MetricKey[];
  // 画角（カメラ・地面グリッドの範囲）を決める点。実測値の反映で点が動いても画角を変えないよう、
  // 補正前の点を渡す。省略時は keypoints
  frameKeypoints?: Keypoint3D[];
};

export function KeypointViewer3D({ keypoints, selectedLabel, className = "", style, adoptedMetrics = [], frameKeypoints }: Props) {
  const [showLabels, setShowLabels] = useState(false);
  const [showDims, setShowDims] = useState(true);
  const [showSolid, setShowSolid] = useState(true);
  const metrics = computeBodyMetrics(keypoints);

  // 画角用の点（3軸そろったもの）を包む箱の中心と半径を Three.js 座標で求め、カメラをそこに合わせる。
  // 地面は表示中の点の一番低い高さ（足先）に置く
  const complete = keypoints.filter(k => keypointStatus(k).complete);
  const midY = midlineY(keypoints);
  const frame = frameKeypoints ?? keypoints;
  const frameMidY = midlineY(frame);
  const pts = frame
    .filter(k => keypointStatus(k).complete)
    .map(k => toThree(k.x_cm!, k.y_cm ?? frameMidY, k.z_cm!));
  let center: [number, number, number] = [0, 0, 0];
  let radius = 30;
  let groundY = 0;
  if (pts.length > 0) {
    const min = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i])));
    const max = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])));
    groundY = metrics.groundZ ?? min[1]; // 採寸値と同じ地面（toThree の Y = Z_db）
    center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    radius = Math.max(10, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  }

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-warm-gutter ${className}`}
      style={style}
    >
      <Canvas
        // 初期位置は FitCamera が決める。-Z 側（Y_db 負側）から見て X+（頭方向）を画面左に向ける
        camera={{ fov: 50 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        onCreated={({ gl }) => {
          gl.setClearColor("#eae4e1");
        }}
      >
        <Scene
          keypoints={keypoints} selectedLabel={selectedLabel} center={center} radius={radius}
          groundY={groundY} showLabels={showLabels} metrics={showDims ? metrics : null} midY={midY} showSolid={showSolid} adoptedMetrics={adoptedMetrics}
        />
      </Canvas>

      {/* 凡例 */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 text-[11px] pointer-events-none">
        <LegendItem color="#D16340" label="選択中" />
        <LegendItem color="#3E6954" label="3軸確定" />
        <LegendItem color="#cfaa55" label="一部確定" dim />
        <button
          type="button"
          onClick={() => setShowLabels(v => !v)}
          aria-pressed={showLabels}
          className={`pointer-events-auto mt-1 px-2 py-1 rounded font-bold transition-colors
            ${showLabels ? "bg-ink-primary text-white" : "bg-white/70 text-ink-muted hover:bg-white"}`}
        >
          点名 {showLabels ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          onClick={() => setShowDims(v => !v)}
          aria-pressed={showDims}
          className={`pointer-events-auto px-2 py-1 rounded font-bold transition-colors
            ${showDims ? "bg-[#556E97] text-white" : "bg-white/70 text-ink-muted hover:bg-white"}`}
        >
          寸法 {showDims ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          onClick={() => setShowSolid(v => !v)}
          aria-pressed={showSolid}
          className={`pointer-events-auto px-2 py-1 rounded font-bold transition-colors
            ${showSolid ? "bg-accent-green text-white" : "bg-white/70 text-ink-muted hover:bg-white"}`}
        >
          ソリッド {showSolid ? "ON" : "OFF"}
        </button>
      </div>

      {adoptedMetrics.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#556E97] text-white text-[11px] font-bold pointer-events-none">
          実測値に合わせて補正表示中
        </div>
      )}

      {/* 軸凡例 */}
      <div className="absolute top-3 right-16 flex flex-col gap-0.5 text-[11px] pointer-events-none">
        <span className="font-bold text-[#556E97]">X: 前後（体長）</span>
        <span className="font-bold text-[#3E6954]">Y: 左右（体幅）</span>
        <span className="font-bold text-[#D16340]">Z: 上下（高さ）</span>
      </div>

      {/* 3軸そろった参照点がまだない */}
      {complete.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
          <p className="text-base font-bold text-ink-dark bg-white/80 rounded-xl px-4 py-2">採寸を実施してください</p>
          <p className="text-xs text-ink-muted">左側面と真上の写真に点を配置すると3Dで表示されます</p>
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-ink-muted pointer-events-none">
        ドラッグ: 回転 ／ スクロール: ズーム ／ 右ドラッグ: パン
      </div>
    </div>
  );
}

function LegendItem({ color, label, dim }: { color: string; label: string; dim?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/70 rounded px-1.5 py-0.5">
      <div
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color, opacity: dim ? 0.55 : 1 }}
      />
      <span className="text-ink-muted">{label}</span>
    </div>
  );
}
