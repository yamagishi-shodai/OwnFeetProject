"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createSession } from "@/hooks/useKarte";
import { uploadSessionView } from "@/lib/session-views";
import { Karte } from "@/components/karte/Karte";
import type { DogPatch } from "@/components/dogs/DogInfoForm";
import type { ViewType } from "@/types";

const UNNAMED = "名前未設定";

type Created = { dogId: string; sessionId: string | null };

// ?dog_id= 付き（犬の登録直後など）: すぐにその犬のカルテ（セッション）を作って移動する
function StartForExistingDog({ dogId }: { dogId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // 開発時の StrictMode で effect が2回走っても1件だけ作るよう ref で守る
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createSession(dogId).then(({ id, error: err }) => {
      if (id) router.replace(`/dogs/${dogId}?session=${id}`);
      else setError(err ?? "カルテの作成に失敗しました");
    });
  }, [dogId, router]);

  return (
    <p className={`p-8 text-sm ${error ? "text-accent-red" : "text-ink-muted"}`}>
      {error ?? "カルテを作成しています…"}
    </p>
  );
}

// 新しいカルテ（下書き）: 空のカルテを表示し、基本情報の入力か撮影をした時点で犬とカルテを DB に作る
function DraftKarte() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // 犬とセッションは1回だけ作る（基本情報の保存と撮影が重なっても二重に作らない）
  const creating = useRef<Promise<Created | null> | null>(null);

  function ensureKarte(patch?: DogPatch): Promise<Created | null> {
    if (!creating.current) {
      creating.current = (async () => {
        const { data: dog, error: dogErr } = await supabase
          .from("dogs")
          .insert({
            name: patch?.name || UNNAMED,
            breed: patch?.breed ?? null,
            weight_kg: patch?.weight_kg ?? null,
            birth_date: patch?.birth_date ?? null,
            notes: patch?.notes ?? null,
          })
          .select("id")
          .single();
        if (!dog) {
          setError(dogErr?.message ?? "カルテの作成に失敗しました");
          creating.current = null; // 失敗したら次の操作でやり直せるようにする
          return null;
        }
        // セッション作成に失敗しても犬は作れているので、カルテ側で撮影時に作り直せる
        const { id: sessionId } = await createSession(dog.id);
        return { dogId: dog.id, sessionId };
      })();
    }
    return creating.current;
  }

  function karteUrl({ dogId, sessionId }: Created) {
    return `/dogs/${dogId}${sessionId ? `?session=${sessionId}` : ""}`;
  }

  // 基本情報が初めて入力された → 作ってから通常のカルテに切り替える
  async function handleCreateDog(patch: DogPatch) {
    const created = await ensureKarte(patch);
    if (created) router.replace(karteUrl(created));
  }

  // 撮影した → 作ってから写真を登録（その後 Karte が設定ページへ移る）
  async function handleAddPhoto(viewType: ViewType, file: File) {
    const created = await ensureKarte();
    if (!created) return { sessionId: null, error: "カルテの作成に失敗しました" };
    let sessionId = created.sessionId;
    if (!sessionId) {
      const res = await createSession(created.dogId);
      if (!res.id) return { sessionId: null, error: res.error ?? "カルテの作成に失敗しました" };
      sessionId = res.id;
    }
    const { error: upErr } = await uploadSessionView(sessionId, viewType, file);
    return { sessionId, error: upErr };
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-ink-dark">新しいカルテ</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          基本情報を入力するか写真を登録すると、自動でカルテが保存されます
        </p>
      </div>

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <Karte
        dogId={null}
        session={null}
        onAddPhoto={handleAddPhoto}
        onReplacePhoto={handleAddPhoto}
        onCreateDog={handleCreateDog}
        onSaveManual={async () => null}
      />
    </div>
  );
}

function NewKartePage() {
  const dogId = useSearchParams().get("dog_id");
  return dogId ? <StartForExistingDog dogId={dogId} /> : <DraftKarte />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">読み込み中…</p>}>
      <NewKartePage />
    </Suspense>
  );
}
