"use client";

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { buildJointSolid, jointStlBlob } from "@/lib/joint-parts";
import type { JointRecord } from "@/lib/wheelchair";

// 二重の接合部の部品を横に並べて 3D 表示し、STL でダウンロードできるようにする
export function JointPartsPreview({ joints }: { joints: JointRecord[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {joints.map(j => <JointPart key={j.name} joint={j} />)}
    </div>
  );
}

function JointPart({ joint }: { joint: JointRecord }) {
  // 向きが変わったときだけ作り直す（ブーリアン演算は重いので）
  const key = joint.dirs.map(d => d.map(v => v.toFixed(4)).join(",")).join(";");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => buildJointSolid(joint.dirs), [key]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  // 画角: 部品を包む球が収まる距離から、T 字の平面（回転後の XY 平面）を少し斜め前から見る
  const sphere = geometry.boundingSphere!;
  const target: [number, number, number] = [sphere.center.x, sphere.center.z, -sphere.center.y]; // X 軸 -90° 回転後
  const fov = 40;
  const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 1.05;
  const dir = new THREE.Vector3(0.25, 0.35, 1).normalize();
  const camPos: [number, number, number] = [target[0] + dir.x * dist, target[1] + dir.y * dist, target[2] + dir.z * dist];

  function download() {
    const url = URL.createObjectURL(jointStlBlob(geometry));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${joint.name}.stl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-light p-2">
      <div className="h-52 rounded-lg overflow-hidden bg-warm-gutter">
        <Canvas camera={{ fov, position: camPos, near: dist / 100, far: dist * 10 }} gl={{ antialias: true }}
          onCreated={({ gl }) => gl.setClearColor("#eae4e1")}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[1, 2, 1.5]} intensity={1.2} />
          <directionalLight position={[-1, -0.5, -1]} intensity={0.4} />
          {/* 部品は Z 上向き（STL と同じ）なので、画面では Y 上向きに回して表示する */}
          <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color="#8a7a6a" roughness={0.6} metalness={0.05} />
          </mesh>
          <OrbitControls makeDefault target={target} />
        </Canvas>
      </div>
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-xs font-bold text-ink-dark">{joint.name} <span className="text-ink-muted">×{joint.count}</span></p>
          <p className="text-[10px] text-ink-muted tabular-nums">
            二重・{joint.angle.toFixed(1)}° ／ 外形 {size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} mm
          </p>
        </div>
        <button type="button" onClick={download} className="shrink-0 text-xs text-accent-blue hover:underline">
          STL をダウンロード
        </button>
      </div>
    </div>
  );
}
