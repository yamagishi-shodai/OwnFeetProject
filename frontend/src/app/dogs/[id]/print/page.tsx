"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { useKarte } from "@/hooks/useKarte";
import { keypointStatus } from "@/lib/coords-3d";
import { adoptedValues, applyManualMetrics, computeBodyMetrics, estimatedValue } from "@/lib/body-metrics";
import {
  WHEELCHAIR_DEFS, WHEELCHAIR_KEYS, autoWheelchairValues, estimateWheelchair, placeWheelchair, resolveWheelchair,
} from "@/lib/wheelchair";
import { AnnotatedViewImage } from "@/components/karte/AnnotatedViewImage";
import { METRIC_DEFS } from "@/components/karte/BodyMetricsCard";
import { JointTable, PipeTable, frameSpecText } from "@/components/karte/WheelchairTables";
import { ageText } from "@/components/dogs/DogInfoForm";
import { Button } from "@/components/ui/Button";
import type { ViewType } from "@/types";

const KeypointViewer3D = dynamic(
  () => import("@/components/measurement/KeypointViewer3D").then(m => ({ default: m.KeypointViewer3D })),
  { ssr: false }
);

const fmt = (v: number) => v.toFixed(1);
const formatDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
const PHOTO_ORDER: ViewType[] = ["side_left", "top"];

// 印刷の設定（このページだけ）: A4 縦・余白 12mm。背景は白にして、表の色はそのまま印刷する
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: white !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

// 3D を画像にするときの大きさ（画面外で描く）
const SNAPSHOT_STYLE = { width: 900, height: 600 };

// カルテの印刷用ページ。ブラウザの印刷画面から「PDF に保存」で PDF にする（A4 縦）
function KartePrintPage() {
  const { id } = useParams<{ id: string }>();
  const sessionParam = useSearchParams().get("session");
  const { dog, session, loading, error } = useKarte(id, sessionParam);
  const [dogImage, setDogImage] = useState<string | null>(null);
  const [chairImage, setChairImage] = useState<string | null>(null);

  const keypoints = useMemo(() => session?.keypoints ?? [], [session]);
  const manual = session?.manualMetrics ?? null;
  const design = session?.wheelchairDesign ?? null;
  const hasMeasurement = keypoints.some(k => keypointStatus(k).complete);
  const displayKeypoints = useMemo(() => applyManualMetrics(keypoints, manual), [keypoints, manual]);
  const metrics = computeBodyMetrics(keypoints);
  const adopted = adoptedValues(manual);

  const chair = useMemo(() => {
    if (!hasMeasurement) return null;
    const estimated = estimateWheelchair(displayKeypoints);
    const used = resolveWheelchair(estimated, design);
    return { auto: autoWheelchairValues(estimated, design), used, placement: placeWheelchair(displayKeypoints, used) };
  }, [hasMeasurement, displayKeypoints, design]);
  const frame = chair?.placement?.frame ?? null;

  // 3D の画像がそろったら印刷できる（採寸がなければ待たない）
  const imagesReady = !hasMeasurement || (!!dogImage && (!chair?.placement || !!chairImage));

  // 保存するときのファイル名の初期値になる
  useEffect(() => {
    if (dog && session) document.title = `カルテ_${dog.name}_${formatDate(session.created_at)}`;
  }, [dog, session]);

  if (loading) return <p className="p-8 text-sm text-ink-muted">読み込み中…</p>;
  if (!dog || !session) return <p className="p-8 text-sm text-accent-red">{error ?? "カルテが見つかりません"}</p>;

  const photos = PHOTO_ORDER.map(vt => session.views.find(v => v.view_type === vt && v.image_url)).filter(v => !!v);

  return (
    <div className="flex flex-col items-center gap-4 py-6 print:py-0">
      <style>{PRINT_CSS}</style>
      {/* 操作バー（印刷しない） */}
      <div className="print:hidden w-[210mm] max-w-full flex items-center justify-between gap-3 px-1">
        <Link href={`/dogs/${id}?session=${session.id}`} className="text-xs text-accent-blue hover:underline">
          ← カルテに戻る
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted">
            {imagesReady ? "印刷画面で「PDF に保存」を選ぶと PDF になります" : "3D 画像を作成中…"}
          </span>
          <Button variant="primary" size="sm" onClick={() => window.print()} disabled={!imagesReady}>
            印刷 / PDF として保存
          </Button>
        </div>
      </div>

      {/* A4 の紙 */}
      <article className="w-[210mm] max-w-full bg-white text-ink-dark shadow-md p-[12mm] flex flex-col gap-5
        print:w-auto print:max-w-none print:shadow-none print:p-0">

        {/* ── 1ページ目: 基本情報・写真・採寸値 ── */}
        <header className="flex items-end justify-between gap-4 border-b-2 border-ink-dark pb-2">
          <div>
            <p className="text-[10px] text-ink-muted">犬用車椅子 採寸カルテ</p>
            <h1 className="text-2xl font-bold">{dog.name}</h1>
          </div>
          <div className="text-right text-[11px] text-ink-muted">
            <p>採寸日: {formatDate(session.created_at)}</p>
            <p>出力日: {formatDate(new Date())}</p>
          </div>
        </header>

        <Section title="基本情報">
          <table className="w-full text-xs">
            <tbody>
              <InfoRow label="名前" value={dog.name} />
              <InfoRow label="犬種" value={dog.breed} />
              <InfoRow label="体重" value={dog.weight_kg != null ? `${dog.weight_kg} kg` : null} />
              <InfoRow
                label="生年月日"
                value={dog.birth_date ? `${formatDate(dog.birth_date)}（${ageText(dog.birth_date)}）` : null}
              />
              <InfoRow label="メモ" value={dog.notes} multiline />
            </tbody>
          </table>
        </Section>

        <Section title="写真">
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {photos.map(v => (
                <AnnotatedViewImage key={v.id} view={v} keypoints={keypoints} clicks={session.clicks} />
              ))}
            </div>
          ) : <Empty />}
        </Section>

        <Section title="採寸値">
          {hasMeasurement ? (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-default text-ink-muted">
                    <Th>項目</Th><Th right>推定値</Th><Th right>実測値</Th><Th right>推定との差</Th><Th>3D への採用</Th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_DEFS.map(def => {
                    const est = estimatedValue(metrics, def.key);
                    const measured = manual?.[def.key] ?? null;
                    return (
                      <tr key={def.key} className="border-b border-border-light">
                        <Td>
                          <span className="font-bold">{def.title}</span>
                          <span className="ml-1 text-[10px] text-ink-muted">（{def.note}）</span>
                        </Td>
                        <Td right>{est != null ? `${fmt(est)} cm` : "—"}</Td>
                        <Td right>{measured != null ? `${fmt(measured)} cm` : "—"}</Td>
                        <Td right>
                          {measured != null && est != null ? `${measured - est >= 0 ? "+" : ""}${fmt(measured - est)} cm` : "—"}
                        </Td>
                        <Td>{adopted[def.key] != null ? "採用" : "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[10px] text-ink-muted">
                {keypoints.filter(k => keypointStatus(k).complete).length} 部位確定。推定値は写真に置いた点から計算した値
              </p>
            </>
          ) : <Empty />}
        </Section>

        {/* ── 2ページ目: 3D・車椅子設計 ── */}
        <div className="break-before-page flex flex-col gap-5">
          <Section title="3D モデル">
            {hasMeasurement ? (
              <div className="grid grid-cols-2 gap-3">
                <Figure caption={Object.keys(adopted).length ? "犬（実測値で補正）" : "犬"} src={dogImage} />
                {chair?.placement && <Figure caption="犬と車椅子" src={chairImage} />}
              </div>
            ) : <Empty />}
          </Section>

          <Section title="車椅子設計（後脚サポート型・2輪）">
            {chair ? (
              <>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-default text-ink-muted">
                      <Th>項目</Th><Th right>自動計算</Th><Th right>設計値</Th><Th right>使用値</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {WHEELCHAIR_KEYS.map(k => {
                      const auto = chair.auto[k];
                      const set = design?.[k] ?? null;
                      const used = chair.used[k];
                      return (
                        <tr key={k} className="border-b border-border-light">
                          <Td>
                            <span className="font-bold">{WHEELCHAIR_DEFS[k].title}</span>
                            <span className="ml-1 text-[10px] text-ink-muted">（{WHEELCHAIR_DEFS[k].note}）</span>
                          </Td>
                          <Td right>{auto != null ? `${fmt(auto)} cm` : "—"}</Td>
                          <Td right>{set != null ? `${fmt(set)} cm` : "—"}</Td>
                          <Td right bold>{used != null ? `${fmt(used)} cm` : "—"}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {frame && (
                  <div className="mt-2 flex flex-col gap-0.5 text-[10px] text-ink-muted">
                    <p><span className="font-bold text-ink-dark">垂直材長 {fmt(frame.verticalLength)} cm</span>（車輪が地面に接するよう自動計算）</p>
                    <p>{frameSpecText()}</p>
                    {frame.warnings.map(w => <p key={w} className="font-bold text-accent-red">⚠ {w}</p>)}
                  </div>
                )}
              </>
            ) : <Empty />}
          </Section>
        </div>

        {/* ── 3ページ目: 部材一覧 ── */}
        {frame && frame.pipeRecords.length > 0 && (
          <div className="break-before-page flex flex-col gap-5">
            <Section title="パイプ一覧（切断寸法）">
              <div className="flex flex-col gap-1"><PipeTable frame={frame} /></div>
            </Section>
            <Section title="接合部一覧（ジョイント）">
              <div className="flex flex-col gap-1"><JointTable frame={frame} /></div>
            </Section>
          </div>
        )}

        <p className="text-[9px] text-ink-light">
          ※ 寸法は写真から推定した採寸値にもとづく目安です。製作前に実際の体に合わせて確認してください
        </p>
      </article>

      {/* 3D を画像にするための描画（画面外。画像ができたら消す） */}
      {hasMeasurement && (
        <div aria-hidden className="print:hidden fixed -left-[10000px] top-0">
          {!dogImage && (
            <KeypointViewer3D
              keypoints={displayKeypoints} frameKeypoints={keypoints} selectedLabel=""
              hideControls onSnapshot={setDogImage} style={SNAPSHOT_STYLE}
            />
          )}
          {chair?.placement && !chairImage && (
            <KeypointViewer3D
              keypoints={displayKeypoints} frameKeypoints={keypoints} selectedLabel="" wheelchair={chair.placement}
              hideControls onSnapshot={setChairImage} style={SNAPSHOT_STYLE}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid flex flex-col gap-2">
      <h2 className="text-sm font-bold border-l-4 border-accent-green pl-2">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <tr className="border-b border-border-light align-top">
      <th className="w-28 py-1.5 pr-3 text-left font-bold text-ink-muted">{label}</th>
      <td className={`py-1.5 ${multiline ? "whitespace-pre-wrap" : ""}`}>{value || "—"}</td>
    </tr>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`py-1.5 px-2 font-bold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, right, bold }: { children: ReactNode; right?: boolean; bold?: boolean }) {
  return <td className={`py-1.5 px-2 tabular-nums ${right ? "text-right whitespace-nowrap" : ""} ${bold ? "font-bold" : ""}`}>{children}</td>;
}

function Figure({ caption, src }: { caption: string; src: string | null }) {
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs font-bold text-ink-muted">{caption}</figcaption>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={caption} className="w-full rounded-lg border border-border-light" />
      ) : (
        <div className="aspect-[3/2] rounded-lg border border-border-light flex items-center justify-center text-[11px] text-ink-muted">
          作成中…
        </div>
      )}
    </figure>
  );
}

function Empty() {
  return <p className="text-xs text-ink-muted">未採寸</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">読み込み中…</p>}>
      <KartePrintPage />
    </Suspense>
  );
}
