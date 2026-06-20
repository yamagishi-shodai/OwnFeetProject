"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { linkButtonClass } from "@/components/ui/Button";
import type { SessionExport } from "@/types";

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SessionExport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: session } = await supabase
        .from("measurement_sessions")
        .select("*")
        .eq("id", id)
        .single();

      if (!session) { setLoading(false); return; }

      const [{ data: dog }, { data: measurements }] = await Promise.all([
        supabase.from("dogs").select("*").eq("id", session.dog_id).single(),
        supabase.from("measurements").select("*").eq("session_id", id).order("created_at"),
      ]);

      if (dog) {
        setData({
          exported_at: new Date().toISOString(),
          dog,
          session,
          measurements: measurements ?? [],
        });
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function handleDownload() {
    if (!data) return;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `measurement_${data.dog.name}_${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="p-8 text-sm text-ink-muted">読み込み中…</p>;
  if (!data) return <p className="p-8 text-sm text-accent-red">データが見つかりません</p>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-dark">採寸データ エクスポート</h1>
        <Link href={`/sessions/${id}`} className={linkButtonClass("secondary", "sm")}>
          ← 採寸ツールへ
        </Link>
      </div>

      {/* サマリー */}
      <Card className="flex flex-col gap-3">
        <div className="flex justify-between text-sm">
          <span className="text-ink-muted font-bold">犬</span>
          <span className="text-ink-dark font-bold">{data.dog.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink-muted font-bold">採寸日</span>
          <span className="text-ink-dark">
            {new Date(data.session.created_at).toLocaleDateString("ja-JP")}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink-muted font-bold">スケール</span>
          <span className="text-ink-dark">
            {data.session.pixels_per_cm
              ? `${data.session.pixels_per_cm.toFixed(2)} px/cm`
              : "未設定"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink-muted font-bold">採寸件数</span>
          <span className="text-ink-dark font-bold">{data.measurements.length} 件</span>
        </div>
      </Card>

      {/* 採寸一覧 */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-muted">採寸値</h2>
        {data.measurements.length === 0 ? (
          <p className="text-sm text-ink-light">採寸データがありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default">
                <th className="text-left py-1 text-xs font-bold text-ink-muted">部位</th>
                <th className="text-right py-1 text-xs font-bold text-ink-muted">cm</th>
              </tr>
            </thead>
            <tbody>
              {data.measurements.map((m) => (
                <tr key={m.id} className="border-b border-border-light last:border-0">
                  <td className="py-2 font-bold text-ink-dark">{m.label}</td>
                  <td className="py-2 text-right font-bold text-accent-red tabular-nums">
                    {m.value_cm.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* JSON プレビュー */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-muted">JSON プレビュー</h2>
        <pre className="text-xs text-ink-dark bg-warm-bg rounded-xl p-3 overflow-auto max-h-64 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      </Card>

      <Button variant="primary" onClick={handleDownload} className="w-full justify-center h-12 text-base">
        ⬇ JSON をダウンロード
      </Button>
    </div>
  );
}
