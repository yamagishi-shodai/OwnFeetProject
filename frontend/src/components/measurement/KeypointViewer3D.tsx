"use client";

import React from "react";
import { Canvas } from "@react-three/fiber";
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
function FloorGrid({ center }: { center: [number, number, number] }) {
  const size = 60;
  const step = 10;
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
function KpSphere({ kp, selected }: { kp: Keypoint3D; selected: boolean }) {
  const status = keypointStatus(kp);
  const pos = toThree(kp.x_cm ?? 0, kp.y_cm ?? 0, kp.z_cm ?? 0);
  const color = selected ? "#D16340" : status.complete ? "#3E6954" : "#cfaa55";
  const r = selected ? 0.7 : 0.55;

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
        distanceFactor={40}
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
function Scene({ keypoints, selectedLabel, center }: { keypoints: Keypoint3D[]; selectedLabel: string; center: [number, number, number] }) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[20, 30, 20]} intensity={0.8} />

      <FloorGrid center={center} />
      <axesHelper args={[20]} />

      <SkeletonEdges keypoints={keypoints} />

      {keypoints.map(kp => (
        <KpSphere key={kp.id} kp={kp} selected={kp.label === selectedLabel} />
      ))}

      <OrbitControls
        target={center}
        minDistance={5}
        maxDistance={300}
      />

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
  // 重心を Three.js 座標で計算（床面 Y=0 固定）。カメラはこの重心からの相対位置に置く
  // ——固定のワールド座標にすると、データの重心が原点から離れている場合に
  // 視点が被写体からズレて水平に近いグレージング角度になり、3Dビューが横倒しに見えてしまう
  const complete = keypoints.filter(k => keypointStatus(k).complete);
  const center: [number, number, number] = complete.length > 0
    ? [
        complete.reduce((s, k) => s + k.x_cm!, 0) / complete.length,
        0,
        complete.reduce((s, k) => s + k.y_cm!, 0) / complete.length, // Three.js Z = Y_db
      ]
    : [0, 0, 0];

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-warm-gutter ${className}`}
      style={style}
    >
      <Canvas
        camera={{ position: [center[0] + 40, center[1] + 30, center[2] + 50], fov: 50, near: 0.1, far: 2000 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        onCreated={({ gl }) => {
          gl.setClearColor("#eae4e1");
        }}
      >
        <Scene keypoints={keypoints} selectedLabel={selectedLabel} center={center} />
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

      {keypoints.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted pointer-events-none">
          キーポイントを配置すると3Dで表示されます
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
