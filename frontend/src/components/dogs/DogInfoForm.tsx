"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/Input";
import type { Dog } from "@/types";

type Props = { dogId: string };

export function DogInfoForm({ dogId }: Props) {
  const [dog, setDog] = useState<Dog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("dogs").select("*").eq("id", dogId).single();
      if (!cancelled) { setDog(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [dogId]);

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string)?.trim();
    if (!name) { setError("名前を入力してください"); return; }

    setSaving(true);
    const patch = {
      name,
      breed: (fd.get("breed") as string) || null,
      weight_kg: fd.get("weight_kg") ? Number(fd.get("weight_kg")) : null,
      birth_date: (fd.get("birth_date") as string) || null,
      notes: (fd.get("notes") as string) || null,
    };
    const { data, error: updateErr } = await supabase
      .from("dogs").update(patch).eq("id", dogId).select().single();
    setSaving(false);

    if (updateErr || !data) { setError(updateErr?.message ?? "更新に失敗しました"); return; }
    setDog(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  if (loading) return <p className="text-xs text-ink-muted">読み込み中…</p>;
  if (!dog) return <p className="text-xs text-accent-red">犬情報が見つかりません</p>;

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3">
      <Input id="dog_name" name="name" label="名前 *" defaultValue={dog.name} required />
      <Input id="dog_breed" name="breed" label="犬種" defaultValue={dog.breed ?? ""} />
      <Input
        id="dog_weight_kg" name="weight_kg" label="体重 (kg)"
        type="number" step="0.1" min="0" defaultValue={dog.weight_kg ?? ""}
      />
      <Input id="dog_birth_date" name="birth_date" label="生年月日" type="date" defaultValue={dog.birth_date ?? ""} />
      <div className="flex flex-col gap-1">
        <label htmlFor="dog_notes" className="text-xs font-bold text-ink-muted">メモ</label>
        <textarea
          id="dog_notes" name="notes" rows={3} defaultValue={dog.notes ?? ""}
          className="px-3 py-2 rounded-xl border border-border-default bg-white text-sm text-ink-primary
            focus:outline-none focus:ring-2 focus:ring-accent-green/40 focus:border-accent-green resize-none"
        />
      </div>

      {error && <p className="text-xs text-accent-red">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 rounded-xl bg-accent-green text-white text-xs font-bold disabled:opacity-50"
      >
        {saving ? "保存中…" : saved ? "✓ 保存しました" : "保存する"}
      </button>
    </form>
  );
}
