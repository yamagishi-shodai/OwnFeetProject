"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useDogs } from "@/hooks/useDogs";
import { uploadSessionView } from "@/lib/session-views";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MediaCapture } from "@/components/capture/MediaCapture";

// マットPDF生成（印刷用）が参照する標準サイズ。ユーザー入力は廃止し固定値を使う
const STANDARD_MAT_WIDTH_CM = 84;
const STANDARD_MAT_HEIGHT_CM = 119;

type Step = "capture" | "details";
type DogMode = "new" | "existing";

function NewSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultDogId = searchParams.get("dog_id") ?? "";

  const { dogs, loading: dogsLoading, createDog } = useDogs();
  const [step, setStep] = useState<Step>("capture");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  // ?dog_id= 付きで来た場合（犬詳細の「＋新しい採寸」）は既存犬選択をデフォルトにする
  const [dogMode, setDogMode] = useState<DogMode>(defaultDogId ? "existing" : "new");
  const [dogId, setDogId] = useState(defaultDogId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCapture(file: File) {
    setCapturedFile(file);
    setCapturedPreviewUrl(URL.createObjectURL(file));
    setStep("details");
  }

  function handleRetake() {
    if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    setCapturedFile(null);
    setCapturedPreviewUrl(null);
    setStep("capture");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!capturedFile) { setError("写真または動画を撮影してください"); return; }

    setSaving(true);
    setError(null);

    let resolvedDogId = dogId;

    if (dogMode === "new") {
      const fd = new FormData(e.currentTarget);
      const name = (fd.get("name") as string)?.trim();
      if (!name) { setError("犬の名前を入力してください"); setSaving(false); return; }

      const { dog, error: createErr } = await createDog({
        name,
        breed: (fd.get("breed") as string) || null,
        weight_kg: fd.get("weight_kg") ? Number(fd.get("weight_kg")) : null,
        birth_date: (fd.get("birth_date") as string) || null,
        notes: (fd.get("notes") as string) || null,
      });
      if (!dog) { setError(createErr ?? "犬の登録に失敗しました"); setSaving(false); return; }
      resolvedDogId = dog.id;
    } else if (!resolvedDogId) {
      setError("犬を選択してください");
      setSaving(false);
      return;
    }

    const { data: session, error: sessionErr } = await supabase
      .from("measurement_sessions")
      .insert({
        dog_id: resolvedDogId,
        mat_width_cm: STANDARD_MAT_WIDTH_CM,
        mat_height_cm: STANDARD_MAT_HEIGHT_CM,
        image_url: null, pixels_per_cm: null, notes: null,
      })
      .select()
      .single();

    if (sessionErr || !session) {
      setError(sessionErr?.message ?? "セッション作成に失敗しました");
      setSaving(false);
      return;
    }

    const { error: viewErr } = await uploadSessionView(session.id, "top", capturedFile);
    if (viewErr) {
      setError(viewErr);
      setSaving(false);
      return;
    }

    router.push(`/sessions/${session.id}/3d`);
  }

  if (step === "capture") {
    return <MediaCapture onCapture={handleCapture} onCancel={() => router.back()} />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-ink-dark mb-6">採寸セッションを開始</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* 左: 撮影済み画像プレビュー */}
        <Card className="flex flex-col gap-2">
          {capturedPreviewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capturedPreviewUrl}
              alt="撮影した画像"
              className="w-full max-h-[60vh] object-contain rounded-xl bg-warm-gutter"
            />
          )}
          <button
            type="button"
            onClick={handleRetake}
            className="text-xs text-accent-blue hover:underline self-start"
          >
            撮り直す
          </button>
        </Card>

        {/* 右: 犬の割り当て */}
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* 新規登録 / 既存から選択 の切り替え */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDogMode("new")}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors
                  ${dogMode === "new" ? "bg-accent-green text-white" : "bg-border-default text-ink-muted"}`}
              >
                新しい犬を登録
              </button>
              <button
                type="button"
                onClick={() => setDogMode("existing")}
                className={`text-xs hover:underline ${dogMode === "existing" ? "font-bold text-ink-dark" : "text-ink-muted"}`}
              >
                登録済みの犬から選ぶ
              </button>
            </div>

            {dogMode === "new" ? (
              <>
                <Input id="name" name="name" label="名前 *" placeholder="ポチ" required />
                <Input id="breed" name="breed" label="犬種" placeholder="柴犬" />
                <Input
                  id="weight_kg"
                  name="weight_kg"
                  label="体重 (kg)"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="5.2"
                />
                <Input id="birth_date" name="birth_date" label="生年月日" type="date" />
                <div className="flex flex-col gap-1">
                  <label htmlFor="notes" className="text-xs font-bold text-ink-muted">
                    メモ
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    placeholder="特記事項など"
                    className="px-3 py-2 rounded-xl border border-border-default bg-white text-sm text-ink-primary
                      focus:outline-none focus:ring-2 focus:ring-accent-green/40 focus:border-accent-green resize-none"
                  />
                </div>
              </>
            ) : (
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
            )}

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
