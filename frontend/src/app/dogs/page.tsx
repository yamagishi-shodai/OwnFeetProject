"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDogs } from "@/hooks/useDogs";
import { Card } from "@/components/ui/Card";
import { linkButtonClass } from "@/components/ui/Button";
import { DogCard } from "@/components/dogs/DogCard";

type SortKey = "created_desc" | "name_asc" | "sessions_desc";

function DogsListContent() {
  const searchParams = useSearchParams();
  const { dogs, loading, error, deleteDog } = useDogs();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>("created_desc");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteDog(id: string) {
    setDeleteError(null);
    const { error } = await deleteDog(id);
    if (error) setDeleteError(error);
  }

  const filteredDogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? dogs.filter((d) => [d.name, d.breed ?? ""].some((v) => v.toLowerCase().includes(q)))
      : dogs;

    const sorted = [...filtered];
    switch (sort) {
      case "name_asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "ja"));
        break;
      case "sessions_desc":
        sorted.sort((a, b) => b.sessionCount - a.sessionCount);
        break;
      case "created_desc":
      default:
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  }, [dogs, query, sort]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-dark">登録済みペット</h1>
        <Link href="/dogs/new" className={linkButtonClass("primary", "sm")}>
          ＋ 新しい犬を登録
        </Link>
      </div>

      <div className="flex gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・犬種で絞り込み…"
          className="flex-1 h-10 px-4 rounded-full border border-border-default bg-white text-sm
            focus:outline-none focus:ring-2 focus:ring-accent-green/40"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-10 px-3 rounded-full border border-border-default bg-white text-sm text-ink-primary
            focus:outline-none focus:ring-2 focus:ring-accent-green/40"
        >
          <option value="created_desc">登録日時（新しい順）</option>
          <option value="name_asc">名前順</option>
          <option value="sessions_desc">採寸回数（多い順）</option>
        </select>
      </div>

      {loading && <p className="text-sm text-ink-muted">読み込み中…</p>}
      {error && <p className="text-sm text-accent-red">{error}</p>}
      {deleteError && <p className="text-sm text-accent-red">削除に失敗しました: {deleteError}</p>}

      {!loading && dogs.length === 0 && (
        <Card className="text-center py-12 flex flex-col items-center gap-4">
          <p className="text-ink-muted text-sm">まだ犬が登録されていません</p>
          <Link href="/dogs/new" className={linkButtonClass("primary")}>
            最初の犬を登録する
          </Link>
        </Card>
      )}

      {!loading && dogs.length > 0 && filteredDogs.length === 0 && (
        <Card className="text-center py-10 text-sm text-ink-muted">
          「{query}」に一致するペットが見つかりません
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {filteredDogs.map((dog) => (
          <DogCard key={dog.id} dog={dog} onDelete={handleDeleteDog} />
        ))}
      </div>
    </div>
  );
}

export default function DogsListPage() {
  return (
    <Suspense>
      <DogsListContent />
    </Suspense>
  );
}
