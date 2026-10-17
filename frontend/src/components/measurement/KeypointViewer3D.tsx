"use client";

import React, { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import type { Keypoint3D } from "@/types";
import { keypointStatus } from "@/lib/coords-3d";

// ── 犬の骨格ライン定義 ─────────────────────────────────────────
const SKELETON_EDGES: [string, string][] = [
  ["右肩", "左肩"],
  ["右腰", "左腰"],
  ["右肩", "右腰"],
  ["左肩", "左腰"],
  ["鼻先", "首"],
  ["首",   "右肩"],
  ["首",   "左肩"],
  ["尾根", "右腰"],
  ["尾根", "左腰"],
  ["右肩", "右前足首"],
  ["左肩", "左前足首"],
  ["右腰", "右後足首"],
  ["左腰", "左後足首"],
];

// DB座標 (X=体長, Y=体幅, Z=高さ) → Three.js座標 (Y=上) への変換
// Three.js: X=体長, Y=高さ(Z_db), Z=体幅(Y_db)
function toThree(x: number, y: number, z: number): [number, number, number] {
  return [x, z, y]; // Three.js Y=高さ=Z_db, Three.js Z=体幅=Y_db
}

// ── グリッド（床面 = XY平面 = Three.jsのXZ平面） ─────────────
function FloorGrid({ center, radius }: { center: [number, number, number]; radius: number }) {
  const step = 10;
  // 点の広がりを覆う大きさ（10cm 単位、最低 60cm）
  const size = Math.max(60, Math.ceil((radius * 2.4) / (step * 2)) * step * 2);
  const lines: React.ReactNode[] = [];
  const halfSize = size / 2;
  const cx = center[0]; // Three.js X = 体長
  const cy = center[2]; // Three.js Z = 体幅(Y_db)

  for (let i = -halfSize; i <= halfSize; i += step) {
    lines.push(
      <Line key={`x${i}`}
        points={[[cx - halfSize, 0, cy + i], [cx + halfSize, 0, cy + i]]}
        color="#c8bdb0" lineWidth={0.5} />,
      <Line key={`z${i}`}
        points={[[cx + i, 0, cy - halfSize], [cx + i, 0, cy + halfSize]]}
        color="#c8bdb0" lineWidth={0.5} />
    );
  }
  return <>{lines}</>;
}

// ── キーポイント球 ────────────────────────────────────────────
function KpSphere({ kp, selected, scale }: { kp: Keypoint3D; selected: boolean; scale: number }) {
  const status = keypointStatus(kp);
  const pos = toThree(kp.x_cm ?? 0, kp.y_cm ?? 0, kp.z_cm ?? 0);
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
      <Html
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
      </Html>
    </group>
  );
}

// ── 骨格エッジ ────────────────────────────────────────────────
function SkeletonEdges({ keypoints }: { keypoints: Keypoint3D[] }) {
  const byLabel = new Map(keypoints.map(k => [k.label, k]));

  return (
    <>
      {SKELETON_EDGES.map(([a, b]) => {
        const ka = byLabel.get(a);
        const kb = byLabel.get(b);
        if (!ka || !kb) return null;
        if (!keypointStatus(ka).complete || !keypointStatus(kb).complete) return null;
        return (
          <Line
            key={`${a}-${b}`}
            points={[
              toThree(ka.x_cm!, ka.y_cm!, ka.z_cm!),
              toThree(kb.x_cm!, kb.y_cm!, kb.z_cm!),
            ]}
            color="#8a7a6a"
            lineWidth={2}
          />
        );
      })}
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

function Scene({ keypoints, selectedLabel, center, radius }: { keypoints: Keypoint3D[]; selectedLabel: string; center: [number, number, number]; radius: number }) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[20, 30, 20]} intensity={0.8} />

      <FloorGrid center={center} radius={radius} />
      <axesHelper args={[20]} />

      <SkeletonEdges keypoints={keypoints} />

      {keypoints.map(kp => (
        <KpSphere key={kp.id} kp={kp} selected={kp.label === selectedLabel} scale={radius} />
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
};

export function KeypointViewer3D({ keypoints, selectedLabel, className = "", style }: Props) {
  // 3軸そろった点（＋床面 Y=0）を包む箱の中心と半径を Three.js 座標で求め、カメラをそこに合わせる
  const complete = keypoints.filter(k => keypointStatus(k).complete);
  const pts = complete.map(k => toThree(k.x_cm!, k.y_cm!, k.z_cm!));
  let center: [number, number, number] = [0, 0, 0];
  let radius = 30;
  if (pts.length > 0) {
    const min = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i]), i === 1 ? 0 : Infinity));
    const max = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i]), i === 1 ? 0 : -Infinity));
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
        <Scene keypoints={keypoints} selectedLabel={selectedLabel} center={center} radius={radius} />
      </Canvas>

      {/* 凡例 */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 text-[11px] pointer-events-none">
        <LegendItem color="#D16340" label="選択中" />
        <LegendItem color="#3E6954" label="3軸確定" />
        <LegendItem color="#cfaa55" label="一部確定" dim />
      </div>

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
