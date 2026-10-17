"use client";

import { FocusEvent, FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/Input";
import type { Dog, DogInsert } from "@/types";

export type DogPatch = Pick<DogInsert, "name" | "breed" | "weight_kg" | "birth_date" | "notes">;

type Props = {
  // null = 下書き（犬がまだ DB にない）。最初の入力で onCreate が呼ばれる
  dogId: string | null;
  onCreate?: (patch: DogPatch) => Promise<void>;
};

const EMPTY: DogPatch = { name: "", breed: null, weight_kg: null, birth_date: null, notes: null };

function readForm(form: HTMLFormElement): DogPatch {
  const fd = new FormData(form);
  const text = (k: string) => ((fd.get(k) as string) ?? "").trim() || null;
  const weight = text("weight_kg");
  return {
    name: text("name") ?? "",
    breed: text("breed"),
    weight_kg: weight != null && Number.isFinite(Number(weight)) ? Number(weight) : null,
    birth_date: text("birth_date"),
    notes: text("notes"),
  };
}

const samePatch = (a: DogPatch, b: DogPatch) => (Object.keys(a) as (keyof DogPatch)[]).every(k => a[k] === b[k]);

// 犬の基本情報。入力欄から離れたときに自動で保存する（保存ボタンなし）
export function DogInfoForm({ dogId, onCreate }: Props) {
  const [dog, setDog] = useState<Dog | null>(null);
  const [loading, setLoading] = useState(dogId != null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 最後に保存した値（同じ値なら保存しない）
  const lastSaved = useRef<DogPatch>(EMPTY);

  useEffect(() => {
    if (!dogId) return;
    let cancelled = false;
    supabase.from("dogs").select("*").eq("id", dogId).single().then(({ data }) => {
      if (cancelled) return;
      setDog(data);
      if (data) lastSaved.current = {
        name: data.name, breed: data.breed, weight_kg: data.weight_kg, birth_date: data.birth_date, notes: data.notes,
      };
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dogId]);

  async function save(form: HTMLFormElement) {
    const patch = readForm(form);
    if (samePatch(patch, lastSaved.current)) return;
    setError(null);

    // 下書き: 何か入力されたら犬とカルテを作る（名前が空なら「名前未設定」）
    if (!dogId) {
      if (samePatch(patch, EMPTY) || !onCreate) return;
      setSaving(true);
      lastSaved.current = patch;
      await onCreate(patch);
      setSaving(false);
      return;
    }

    if (!patch.name) { setError("名前は必須です"); return; }
    setSaving(true);
    const { data, error: updateErr } = await supabase
      .from("dogs").update(patch).eq("id", dogId).select().single();
    setSaving(false);
    if (updateErr || !data) { setError(updateErr?.message ?? "保存に失敗しました"); return; }
    lastSaved.current = patch;
    setDog(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function handleBlur(e: FocusEvent<HTMLFormElement>) {
    save(e.currentTarget);
  }

  // Enter で確定したときも保存
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save(e.currentTarget);
  }

  if (loading) return <p className="text-xs text-ink-muted">読み込み中…</p>;
  if (dogId && !dog) return <p className="text-xs text-accent-red">犬情報が見つかりません</p>;

  return (
    <form onSubmit={handleSubmit} onBlur={handleBlur} className="flex flex-col gap-4">
      {/* 基本項目は横に並べる（幅に応じて 4 → 2 → 1 列） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Input id="dog_name" name="name" label="名前 *" placeholder="ポチ" defaultValue={dog?.name ?? ""} />
        <Input id="dog_breed" name="breed" label="犬種" placeholder="柴犬" defaultValue={dog?.breed ?? ""} />
        <Input
          id="dog_weight_kg" name="weight_kg" label="体重 (kg)" placeholder="5.2"
          type="number" step="0.1" min="0" defaultValue={dog?.weight_kg ?? ""}
        />
        <div className="flex flex-col gap-1">
          <Input id="dog_birth_date" name="birth_date" label="生年月日" type="date" defaultValue={dog?.birth_date ?? ""} />
          {dog?.birth_date && <p className="text-[11px] text-ink-muted pl-1">{ageText(dog.birth_date)}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="dog_notes" className="text-xs font-bold text-ink-muted">メモ</label>
        <textarea
          id="dog_notes" name="notes" rows={2} defaultValue={dog?.notes ?? ""}
          placeholder="既往歴・歩行の様子・特記事項など"
          className="px-3 py-2 rounded-xl border border-border-default bg-white text-sm text-ink-primary
            focus:outline-none focus:ring-2 focus:ring-accent-green/40 focus:border-accent-green resize-y"
        />
      </div>

      <div className="flex items-center justify-end gap-3 min-h-5 text-xs">
        {error && <p className="text-accent-red mr-auto">{error}</p>}
        {saving ? <p className="text-ink-muted">保存中…</p>
          : saved ? <p className="font-bold text-accent-green">✓ 保存しました</p>
          : <p className="text-ink-light">入力欄から離れると自動で保存されます</p>}
      </div>
    </form>
  );
}

// 生年月日から「3歳2ヶ月」のような表記を作る
export function ageText(birthDate: string): string {
  const b = new Date(birthDate);
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 0) return "";
  if (months < 12) return `${months}ヶ月`;
  return `${Math.floor(months / 12)}歳${months % 12 ? `${months % 12}ヶ月` : ""}`;
}
