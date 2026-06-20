"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useDogs } from "@/hooks/useDogs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function NewSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultDogId = searchParams.get("dog_id") ?? "";

  const { dogs, loading: dogsLoading } = useDogs();
  const [dogId, setDogId] = useState(defaultDogId);
  const [matWidthCm, setMatWidthCm] = useState(84);
  const [matHeightCm, setMatHeightCm] = useState(119);
  const [markerSizeCm, setMarkerSizeCm] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dogId) { setError("犬を選択してください"); return; }

    setSaving(true);
    setError(null);

    const { data: session, error: sessionErr } = await supabase
      .from("measurement_sessions")
      .insert({
        dog_id: dogId,
        mat_grid_cm: matWidthCm,
        mat_width_cm: matWidthCm,
        mat_height_cm: matHeightCm,
        marker_size_cm: markerSizeCm,
        image_url: null, pixels_per_cm: null, notes: null,
      })
      .select()
      .single();

    if (sessionErr || !session) {
      setError(sessionErr?.message ?? "セッション作成に失敗しました");
      setSaving(false);
      return;
    }

    router.push(`/sessions/${session.id}/3d`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-ink-dark mb-6">採寸セッションを開始</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* 犬選択 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="dog_id" className="text-xs font-bold text-ink-muted">
              対象の犬 *
            </label>
            <select
              id="dog_id"
              value={dogId}
              onChange={(e) => setDogId(e.target.value)}
              required
              className="h-10 px-3 rounded-xl border border-border-default bg-white text-sm text-ink-primary
                focus:outline-none focus:ring-2 focus:ring-accent-green/40 focus:border-accent-green"
            >
              <option value="">-- 選択してください --</option>
              {!dogsLoading && dogs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.breed ? `(${d.breed})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* マット寸法 */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink-muted">採寸マットのサイズ</label>
            <p className="text-xs text-ink-muted">
              四隅マーカーの<span className="font-bold">中心から中心</span>までの距離を入力してください
            </p>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-ink-muted">横（幅）</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={matWidthCm}
                    onChange={e => setMatWidthCm(parseFloat(e.target.value) || 0)}
                    min="1" step="1"
                    className="w-20 h-9 px-2 rounded-xl border border-border-default text-sm text-center font-bold
                      focus:outline-none focus:ring-2 focus:ring-accent-green/40"
                  />
                  <span className="text-xs text-ink-muted">cm</span>
                </div>
              </div>
              <span className="text-ink-muted mt-4">×</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-ink-muted">縦（高さ）</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={matHeightCm}
                    onChange={e => setMatHeightCm(parseFloat(e.target.value) || 0)}
                    min="1" step="1"
                    className="w-20 h-9 px-2 rounded-xl border border-border-default text-sm text-center font-bold
                      focus:outline-none focus:ring-2 focus:ring-accent-green/40"
                  />
                  <span className="text-xs text-ink-muted">cm</span>
                </div>
              </div>
            </div>
          </div>

          {/* マーカーサイズ（両面同時補正用・省略可） */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-ink-muted">
              マーカー1辺の実寸
              <span className="ml-1 font-normal text-ink-muted">（L字配置で両面補正を使う場合のみ）</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={markerSizeCm || ""}
                onChange={e => setMarkerSizeCm(parseFloat(e.target.value) || 0)}
                min="0" step="0.5" placeholder="0"
                className="w-20 h-9 px-2 rounded-xl border border-border-default text-sm text-center font-bold
                  focus:outline-none focus:ring-2 focus:ring-accent-green/40"
              />
              <span className="text-xs text-ink-muted">cm（0 = 中心点のみ使用）</span>
            </div>
          </div>

          {error && <p className="text-sm text-accent-red">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" onClick={() => router.back()}>
              キャンセル
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "作成中…" : "採寸を開始する"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense>
      <NewSessionForm />
    </Suspense>
  );
}
