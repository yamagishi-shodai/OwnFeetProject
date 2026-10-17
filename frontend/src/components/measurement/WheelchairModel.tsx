"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  FRAME_SPEC, JOINT_OUTER_R, frameToDb,
  type V3, type WheelchairPlacement,
} from "@/lib/wheelchair";

// 車椅子（frontend/txt のフレームモデル）を 3D ビューに描く

const FRAME_COLOR = "#9aa3ad";   // アルミパイプ
const JOINT_COLOR = "#4a403a";   // ジョイント
const TIRE_COLOR = "#3a3633";
const WHEEL_COLOR = "#556E97";   // リム・ハブ・スポーク

const JOINT_R = FRAME_SPEC.jointDiameter / 2;
const Y_UP = new THREE.Vector3(0, 1, 0);

// DB 座標 (X=体長, Y=体幅, Z=高さ) → Three.js 座標 (Y=上)。KeypointViewer3D の toThree と同じ
const toThree = (p: V3) => new THREE.Vector3(p[0], p[2], p[1]);

// a → b の円柱
function Tube({ a, b, r, color }: { a: THREE.Vector3; b: THREE.Vector3; r: number; color: string }) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(Y_UP, dir.normalize());
  if (len <= 0) return null;
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, 16]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
    </mesh>
  );
}

// 内半径 ri・外半径 ro・幅 w の輪（Y 軸まわり）
function Ring({ ri, ro, w, color }: { ri: number; ro: number; w: number; color: string }) {
  const points = useMemo(
    () => [[ri, -w / 2], [ro, -w / 2], [ro, w / 2], [ri, w / 2], [ri, -w / 2]].map(([x, y]) => new THREE.Vector2(x, y)),
    [ri, ro, w]
  );
  return (
    <mesh>
      <latheGeometry args={[points, 48]} />
      <meshStandardMaterial color={color} roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Wheel({ center, axis, diameter }: { center: THREE.Vector3; axis: THREE.Vector3; diameter: number }) {
  const S = FRAME_SPEC;
  const ro = diameter / 2;
  const ri = Math.max(ro - S.tireDepth, ro * 0.5);
  const rimRo = ri + 0.2;
  const rimRi = Math.max(rimRo - S.rimThickness, S.hubDiameter / 2 + 0.2);
  const hubR = Math.min(S.hubDiameter / 2, rimRi - 0.2);
  const quat = new THREE.Quaternion().setFromUnitVectors(Y_UP, axis.clone().normalize());
  const spokeLen = rimRi - hubR + 0.4;
  return (
    <group position={center} quaternion={quat}>
      <Ring ri={ri} ro={ro} w={S.wheelWidth} color={TIRE_COLOR} />
      <Ring ri={rimRi} ro={rimRo} w={S.rimWidth} color={WHEEL_COLOR} />
      <Ring ri={S.axleDiameter / 2} ro={hubR} w={S.hubWidth} color={WHEEL_COLOR} />
      {spokeLen > 0 && Array.from({ length: S.spokeCount }, (_, n) => {
        const a = (2 * Math.PI * n) / S.spokeCount;
        const rm = hubR - 0.2 + spokeLen / 2;
        return (
          <mesh key={n} position={[Math.cos(a) * rm, 0, Math.sin(a) * rm]} rotation={[0, -a, 0]}>
            <boxGeometry args={[spokeLen, S.spokeDepth, (S.spokeBaseWidth + S.spokeTipWidth) / 2]} />
            <meshStandardMaterial color={WHEEL_COLOR} roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

export function WheelchairModel({ placement }: { placement: WheelchairPlacement }) {
  const { frame, forward } = placement;
  const pt = (q: V3) => toThree(frameToDb(placement, q));
  // 向き（ベクトル）は位置をずらさず、前後の向きだけ合わせる
  const dir = (d: V3) => toThree([forward * d[0], d[1], d[2]]);

  return (
    <group>
      {frame.pipes.map((p, i) => (
        <Tube key={`p${i}`} a={pt(p.a)} b={pt(p.b)} r={p.r} color={FRAME_COLOR} />
      ))}
      {/* ジョイント: 中心から各方向へ差し込み部分（半径 = ジョイント外半径、長さ = ジョイント径の半分） */}
      {frame.joints.map((j, i) => {
        const c = pt(j.center);
        return (
          <group key={`j${i}`}>
            <mesh position={c}>
              <sphereGeometry args={[JOINT_OUTER_R, 16, 16]} />
              <meshStandardMaterial color={JOINT_COLOR} roughness={0.5} />
            </mesh>
            {j.dirs.map((d, k) => (
              <Tube key={k} a={c} b={c.clone().add(dir(d).multiplyScalar(JOINT_R))} r={JOINT_OUTER_R} color={JOINT_COLOR} />
            ))}
          </group>
        );
      })}
      {frame.axles.map((a, i) => (
        <Tube key={`a${i}`} a={pt(a.a)} b={pt(a.b)} r={FRAME_SPEC.axleDiameter / 2 - 0.02} color={JOINT_COLOR} />
      ))}
      {frame.wheels.map((w, i) => (
        <Wheel key={`w${i}`} center={pt(w.center)} axis={dir(w.axis)} diameter={frame.wheelDiameter} />
      ))}
    </group>
  );
}
