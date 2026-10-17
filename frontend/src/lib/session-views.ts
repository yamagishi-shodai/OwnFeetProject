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
  // ビューごとに別ファイルにする（同じパスに上書きすると URL が変わらず、差し替え後も古い画像がキャッシュで表示される）
  const path = `${sessionId}/3d_${viewType}_${viewRecord.id}.${ext}`;
  const { error: uploadErr } = await supabase.storage.from("sessions").upload(path, file, { upsert: true });
  if (uploadErr) {
    return { view: null, error: "アップロード失敗: " + uploadErr.message };
  }

  const { data: urlData } = supabase.storage.from("sessions").getPublicUrl(path);
  const { data: updated } = await supabase
    .from("session_views").update({ image_url: urlData.publicUrl }).eq("id", viewRecord.id).select().single();

  return { view: updated ?? { ...viewRecord, image_url: urlData.publicUrl }, error: null };
}

// 公開 URL から Storage 上のパス（sessions バケット内）を取り出す
function storagePathFromUrl(url: string | null): string | null {
  const marker = "/object/public/sessions/";
  const i = url?.indexOf(marker) ?? -1;
  return url && i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}

// ビューを削除する（そのビューで置いた点のクリックも消す）。画像ファイルの削除は失敗しても続行する
export async function deleteSessionViews(views: Pick<SessionView, "id" | "image_url">[]): Promise<string | null> {
  if (views.length === 0) return null;
  const ids = views.map(v => v.id);
  const { error: clickErr } = await supabase.from("view_clicks").delete().in("view_id", ids);
  if (clickErr) return clickErr.message;
  const { error: viewErr } = await supabase.from("session_views").delete().in("id", ids);
  if (viewErr) return viewErr.message;
  const paths = views.map(v => storagePathFromUrl(v.image_url)).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from("sessions").remove(paths);
  return null;
}
