import { supabase } from "@/lib/supabase";
import type { SessionView, SessionViewInsert, ViewType } from "@/types";

// セッションに1枚のビュー画像を登録する共通処理。
// session_views へ insert → Storage アップロード → image_url 更新、の3段を1つにまとめる。
export async function uploadSessionView(
  sessionId: string,
  viewType: ViewType,
  file: File
): Promise<{ view: SessionView | null; error: string | null }> {
  const { data: viewRecord, error: insertErr } = await supabase
    .from("session_views")
    .insert({ session_id: sessionId, view_type: viewType, image_url: null, pixels_per_cm: null } as SessionViewInsert)
    .select().single();

  if (insertErr || !viewRecord) {
    return { view: null, error: "ビュー作成失敗: " + insertErr?.message };
  }

  const ext = file.name.split(".").pop();
  const path = `${sessionId}/3d_${viewType}.${ext}`;
  const { error: uploadErr } = await supabase.storage.from("sessions").upload(path, file, { upsert: true });
  if (uploadErr) {
    return { view: null, error: "アップロード失敗: " + uploadErr.message };
  }

  const { data: urlData } = supabase.storage.from("sessions").getPublicUrl(path);
  const { data: updated } = await supabase
    .from("session_views").update({ image_url: urlData.publicUrl }).eq("id", viewRecord.id).select().single();

  return { view: updated ?? { ...viewRecord, image_url: urlData.publicUrl }, error: null };
}
