import * as THREE from "three";
import { Brush, Evaluator, ADDITION } from "three-bvh-csg";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { FRAME_SPEC, JOINT_INNER_R, JOINT_OUTER_R, type V3 } from "@/lib/wheelchair";

// 二重の接合部（直角でない T 字ジョイント）の部品形状。元モデル frontend/txt の create_auto_joint と同じく
//   外側: 中心から各差し込み口へ、ジョイント外半径・長さ（ジョイント径の半分）の管（端は平ら）
//   内側: 同じ向きへ、ジョイント内半径・長さ（ジョイント径の半分 + 延長）の管（端は丸め）
// を作り、txt では別々に出していた外側と内側をブーリアン和で1つのソリッドにする。
// 単位は mm、座標は元モデルと同じ Z 上向き（STL の標準）

const MM = 10;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function brushBetween(geometry: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3): Brush {
  const brush = new Brush(geometry);
  brush.position.copy(from).add(to).multiplyScalar(0.5);
  brush.quaternion.setFromUnitVectors(Y_AXIS, to.clone().sub(from).normalize());
  brush.updateMatrixWorld();
  return brush;
}

const cylinder = (from: THREE.Vector3, to: THREE.Vector3, r: number) =>
  brushBetween(new THREE.CylinderGeometry(r, r, from.distanceTo(to), 48), from, to);
// 両端が半球の管（長さは半球を除いた部分）
const capsule = (from: THREE.Vector3, to: THREE.Vector3, r: number) =>
  brushBetween(new THREE.CapsuleGeometry(r, from.distanceTo(to), 12, 48), from, to);

export function buildJointSolid(dirs: V3[]): THREE.BufferGeometry {
  const jr = (FRAME_SPEC.jointDiameter / 2) * MM;
  const ro = JOINT_OUTER_R * MM;
  const ri = JOINT_INNER_R * MM;
  const extra = FRAME_SPEC.jointInnerExtra * MM;
  const vs = dirs.map(d => new THREE.Vector3(...d).normalize());
  const origin = new THREE.Vector3();
  const brushes: Brush[] = [];

  // 外側。同じ半径の管が中心で端を突き合わせると面が重なって演算が崩れるので、
  // 一直線になる2方向は1本の管にまとめる
  const paired = new Set<number>();
  vs.forEach((d, i) => {
    if (paired.has(i)) return;
    const j = vs.findIndex((e, k) => k !== i && !paired.has(k) && e.dot(d) < -0.9999);
    if (j < 0) return;
    paired.add(i); paired.add(j);
    brushes.push(cylinder(d.clone().multiplyScalar(-jr), d.clone().multiplyScalar(jr), ro));
  });
  vs.forEach((d, i) => { if (!paired.has(i)) brushes.push(cylinder(origin, d.clone().multiplyScalar(jr), ro)); });

  // 内側。外側の中に収まる部分は和をとっても形が変わらないので、外へはみ出す延長部分だけを足す
  // （根元は外側の中に 1mm 食い込ませる。丸めた根元も外側の内部に収まる）
  for (const d of vs) {
    brushes.push(capsule(d.clone().multiplyScalar(jr - 1), d.clone().multiplyScalar(jr + extra), ri));
  }

  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal"];
  let result = brushes[0];
  for (const b of brushes.slice(1)) result = evaluator.evaluate(result, b, ADDITION);
  const geometry = result.geometry;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// バイナリ STL（mm）
export function jointStlBlob(geometry: THREE.BufferGeometry): Blob {
  const mesh = new THREE.Mesh(geometry);
  const data = new STLExporter().parse(mesh, { binary: true }) as DataView;
  return new Blob([data.buffer as ArrayBuffer], { type: "model/stl" });
}
