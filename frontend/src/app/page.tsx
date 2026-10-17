"use client";

import Link from "next/link";
import { useDogs } from "@/hooks/useDogs";
import { Card } from "@/components/ui/Card";
import { linkButtonClass } from "@/components/ui/Button";
import { DogCard } from "@/components/dogs/DogCard";
import { SummaryBar } from "@/components/home/SummaryBar";
import { RecentActivity } from "@/components/home/RecentActivity";
import { MeasurementSteps } from "@/components/home/MeasurementSteps";

const PET_PREVIEW_LIMIT = 5;

export default function HomePage() {
  const { dogs, loading, error } = useDogs();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* ウェルカムバナー */}
      <Card className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-dark">ようこそ、採寸プラットフォームへ</h1>
          <p className="text-sm text-ink-muted mt-1">
            基準物と写真から、犬の体のサイズを正確に記録・管理できます。
          </p>
        </div>
        <MeasurementSteps />
        <div className="flex gap-3">
          <Link href="/sessions/new" className={linkButtonClass("primary")}>
            新しいカルテをつくる
          </Link>
          <Link href="/dogs/new" className={linkButtonClass("secondary")}>
            ペットを登録
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* 左：登録済みペット プレビュー */}
        <div className="xl:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink-dark">登録済みペット</h2>
            <Link href="/dogs" className="text-xs text-accent-blue hover:underline">
              すべて見る →
            </Link>
          </div>

          {loading && <p className="text-sm text-ink-muted">読み込み中…</p>}
          {error && <p className="text-sm text-accent-red">{error}</p>}

          {!loading && dogs.length === 0 && (
            <Card className="text-center py-12 flex flex-col items-center gap-4">
              <p className="text-ink-muted text-sm">まだ犬が登録されていません</p>
              <Link href="/dogs/new" className={linkButtonClass("primary")}>
                最初の犬を登録する
              </Link>
            </Card>
          )}

          <div className="flex flex-col gap-3">
            {dogs.slice(0, PET_PREVIEW_LIMIT).map((dog) => (
              <DogCard key={dog.id} dog={dog} />
            ))}
          </div>
        </div>

        {/* 右：サマリー＋直近の活動 */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          <SummaryBar />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
