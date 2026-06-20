"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useDogs } from "@/hooks/useDogs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function NewDogPage() {
  const router = useRouter();
  const { createDog } = useDogs();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const breed = (fd.get("breed") as string) || null;
    const weight_kg = fd.get("weight_kg") ? Number(fd.get("weight_kg")) : null;
    const birth_date = (fd.get("birth_date") as string) || null;
    const notes = (fd.get("notes") as string) || null;

    const { dog, error: createError } = await createDog({ name, breed, weight_kg, birth_date, notes });
    setSaving(false);

    if (!dog) { setError(createError ?? "登録に失敗しました"); return; }
    router.push(`/sessions/new?dog_id=${dog.id}`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-ink-dark mb-6">犬を登録</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          {error && <p className="text-sm text-accent-red">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" onClick={() => router.back()}>
              キャンセル
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "登録中…" : "登録して採寸へ"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
