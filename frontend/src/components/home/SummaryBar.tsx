"use client";

import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { Card } from "@/components/ui/Card";

export function SummaryBar() {
  const { summary, loading, error } = useDashboardSummary();

  if (error) {
    return <p className="text-sm text-accent-red">{error}</p>;
  }

  return (
    <Card className="flex divide-x divide-border-light p-0 overflow-hidden">
      <SummaryStat label="登録犬" value={loading ? "—" : summary?.dogCount ?? 0} />
      <SummaryStat label="累計セッション" value={loading ? "—" : summary?.sessionCount ?? 0} />
      <SummaryStat
        label="スケール未設定"
        value={loading ? "—" : summary?.scaleNotSetCount ?? 0}
        warn={!loading && (summary?.scaleNotSetCount ?? 0) > 0}
      />
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-1 py-4">
      <p className={`text-2xl font-bold ${warn ? "text-accent-red" : "text-ink-dark"}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}
