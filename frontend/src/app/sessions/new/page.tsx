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
  const [matGridCm, setMatGridCm] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dogId) { setError("犬を選択してください"); return; }

    setSaving(true);
    setError(null);

    const { data: session, error: sessionErr } = await supabase
      .from("measurement_sessions")
      .insert({ dog_id: dogId, mat_grid_cm: matGridCm, image_url: null, pixels_per_cm: null, notes: null })
      .select()
      .single();

    if (sessionErr || !session) {
      setError("セッション作成に失敗しました");
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

          {/* ARマット グリッド間隔 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-ink-muted">ARマット グリッド間隔</label>
            <p className="text-xs text-ink-muted">スケール設定に使う既知の距離です</p>
            <div className="flex gap-3">
              {[5, 10].map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="mat_grid"
                    value={v}
                    checked={matGridCm === v}
                    onChange={() => setMatGridCm(v)}
                    className="accent-accent-green"
                  />
                  {v} cm
                </label>
              ))}
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
