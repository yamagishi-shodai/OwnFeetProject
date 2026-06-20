"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/sessions/${id}/3d`);
  }, [id, router]);

  return <p className="p-8 text-sm text-ink-muted">リダイレクト中…</p>;
}
