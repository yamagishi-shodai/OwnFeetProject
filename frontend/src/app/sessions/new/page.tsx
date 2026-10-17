"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDogs } from "@/hooks/useDogs";
import { createSession } from "@/hooks/useKarte";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type DogMode = "new" | "existing";

// 採寸開始 = 犬を決めて空のカルテを作る。撮影・点の配置はカルテから行う
function NewSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultDogId = searchParams.get("dog_id") ?? "";

  const { dogs, loading: dogsLoading, createDog } = useDogs();
  const [dogMode, setDogMode] = useState<DogMode>("new");
  const [dogId, setDogId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // セッション（空のカルテ）を作ってカルテページへ
  async function startKarte(targetDogId: string): Promise<string | null> {
    const { id: sessionId, error: err } = await createSession(targetDogId);
    if (!sessionId) return err ?? "カルテの作成に失敗しました";
    router.replace(`/dogs/${targetDogId}?session=${sessionId}`);
    return null;
  }

  // ?dog_id= 付き（犬の登録直後など）は選択を飛ばしてすぐカルテを作る。
  // 開発時の StrictMode で effect が2回走っても1件だけ作るよう ref で守る
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!defaultDogId || autoStarted.current) return;
    autoStarted.current = true;
    startKarte(defaultDogId).then(err => { if (err) setError(err); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDogId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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

    const err = await startKarte(resolvedDogId);
    if (err) { setError(err); setSaving(false); }
  }

  if (defaultDogId) {
    return (
      <p className={`p-8 text-sm ${error ? "text-accent-red" : "text-ink-muted"}`}>
        {error ?? "カルテを作成しています…"}
      </p>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-ink-dark mb-1">採寸を開始</h1>
      <p className="text-sm text-ink-muted mb-6">採寸する犬を選ぶと、カルテが作成されます。撮影はカルテから行います。</p>
      <div className="flex flex-col gap-6">

        {/* 犬の選択 */}
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
                {saving ? "作成中…" : "カルテを作成する"}
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
