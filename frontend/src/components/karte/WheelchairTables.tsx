import {
  ELBOW_BEND_R, END_TYPE_LABELS, FRAME_SPEC, JOINT_INNER_R, JOINT_OUTER_R,
  type WheelchairFrame,
} from "@/lib/wheelchair";

// 車椅子の部材一覧の表。カルテの車椅子設計カードと、カルテの印刷用ページ（PDF）で共通に使う

export const mm = (cm: number) => (cm * 10).toFixed(1); // 部材一覧は元モデルに合わせて mm で表示

// 固定の仕様（開き角・補強角・パイプ径・ジョイント径・車輪幅）
export function frameSpecText(): string {
  return `開き角 ${FRAME_SPEC.openAngle}° ／ 補強材 ${FRAME_SPEC.braceAngle}° ／ ` +
    `側面パイプ外径 ${FRAME_SPEC.frameOuterR * 20} mm ／ 横パイプ外径 ${FRAME_SPEC.crossOuterR * 20} mm ／ ` +
    `ジョイント径 ${FRAME_SPEC.jointDiameter * 10} mm ／ 車輪幅 ${FRAME_SPEC.wheelWidth * 10} mm`;
}

const th = "px-2 py-1.5 text-left font-bold text-ink-muted whitespace-nowrap";
const td = "px-2 py-1.5 whitespace-nowrap tabular-nums";
const num = `${td} text-right`;

export function PipeTable({ frame }: { frame: WheelchairFrame }) {
  const pipeCount = frame.pipeRecords.reduce((a, r) => a + r.count, 0);
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border-light">
        <table className="w-full text-[11px] text-ink-dark">
          <thead className="bg-warm-sub">
            <tr>
              <th className={th}>部材</th>
              <th className={`${th} text-right`}>数量</th>
              <th className={`${th} text-right`}>外径 / 内径</th>
              <th className={`${th} text-right`}>芯々長</th>
              <th className={th}>端部（1 / 2）</th>
              <th className={`${th} text-right`}>差し込み</th>
              <th className={`${th} text-right`}>切断長</th>
            </tr>
          </thead>
          <tbody>
            {frame.pipeRecords.map(r => (
              <tr key={r.id} className="border-t border-border-light">
                <td className={td}>{r.name}</td>
                <td className={num}>{r.count}</td>
                <td className={num}>{mm(r.outerR * 2)} / {mm(r.innerR * 2)}</td>
                <td className={num}>{mm(r.centerLength)}</td>
                <td className={td}>{END_TYPE_LABELS[r.type1]} / {END_TYPE_LABELS[r.type2]}</td>
                <td className={num}>{mm(r.insert1)} + {mm(r.insert2)}</td>
                <td className={`${num} font-bold ${r.cutLength <= 0 ? "text-accent-red" : ""}`}>{mm(r.cutLength)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border-default bg-warm-sub">
            <tr>
              <td className={`${td} font-bold`}>合計</td>
              <td className={num}>{pipeCount}</td>
              <td colSpan={4} />
              <td className={`${num} font-bold`}>{mm(frame.totalPipeLength)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-ink-muted">
        単位 mm。切断長 = 芯々長 − 両端の控え（中空ジョイント: ジョイント半径 − 差し込み長、二重ジョイント: ジョイント半径、なし: 0）
      </p>
    </>
  );
}

export function JointTable({ frame }: { frame: WheelchairFrame }) {
  const jointCount = frame.jointRecords.reduce((a, j) => a + j.count, 0);
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border-light">
        <table className="w-full text-[11px] text-ink-dark">
          <thead className="bg-warm-sub">
            <tr>
              <th className={th}>接合部</th>
              <th className={th}>形</th>
              <th className={th}>種類</th>
              <th className={`${th} text-right`}>角度</th>
              <th className={`${th} text-right`}>数量</th>
            </tr>
          </thead>
          <tbody>
            {frame.jointRecords.map(j => (
              <tr key={j.name} className="border-t border-border-light">
                <td className={td}>{j.name}</td>
                <td className={td}>{j.kind === "T" ? "T字" : "L字"}</td>
                <td className={td}>{j.type === "hollow" ? "中空（差し込み）" : "二重（内外別体）"}</td>
                <td className={num}>{j.angle.toFixed(1)}°</td>
                <td className={num}>{j.count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border-default bg-warm-sub">
            <tr>
              <td className={`${td} font-bold`} colSpan={4}>合計</td>
              <td className={num}>{jointCount}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-ink-muted">
        ジョイント径 {mm(FRAME_SPEC.jointDiameter)} ／ 内径 {mm(JOINT_INNER_R * 2)} ／ 外径 {mm(JOINT_OUTER_R * 2)} ／
        肉厚 {mm(FRAME_SPEC.jointWall)} ／ エルボ曲げ半径 {mm(ELBOW_BEND_R)} ／ 差し込み長 {mm(FRAME_SPEC.jointInsertDepth)}（mm）。
        直角の接合部は中空、それ以外は二重
      </p>
    </>
  );
}
