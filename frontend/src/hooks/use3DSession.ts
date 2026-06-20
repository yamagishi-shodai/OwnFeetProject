"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pixelToWorld, merge3DPoint, VIEW_AXIS_MAP } from "@/lib/coords-3d";
import type {
  SessionView, SessionViewInsert, Keypoint3D, Keypoint3DInsert,
  ViewClick, ViewType,
} from "@/types";

// ── State ──────────────────────────────────────────────────────

type State = {
  views: SessionView[];
  keypoints: Keypoint3D[];
  clicks: ViewClick[];
  activeViewId: string | null;
  selectedLabel: string;
  matGridCm: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const INITIAL: State = {
  views: [], keypoints: [], clicks: [],
  activeViewId: null,
  selectedLabel: "右肩",
  matGridCm: 10,
  loading: true, saving: false, error: null,
};

// ── Actions ────────────────────────────────────────────────────

type Action =
  | { type: "LOADED"; views: SessionView[]; keypoints: Keypoint3D[]; clicks: ViewClick[]; matGridCm: number }
  | { type: "SET_ACTIVE_VIEW"; viewId: string }
  | { type: "SET_LABEL"; label: string }
  | { type: "VIEW_ADDED"; view: SessionView }
  | { type: "VIEW_CALIBRATED"; view: SessionView }
  | { type: "KEYPOINT_UPSERTED"; keypoint: Keypoint3D }
  | { type: "CLICK_ADDED"; click: ViewClick }
  | { type: "CLICK_UPDATED"; click: ViewClick }
  | { type: "KEYPOINT_DELETED"; id: string }
  | { type: "SAVING" }
  | { type: "DONE" }
  | { type: "ERROR"; message: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "LOADED":
      return { ...s, views: a.views, keypoints: a.keypoints, clicks: a.clicks,
               matGridCm: a.matGridCm, activeViewId: a.views[0]?.id ?? null, loading: false };
    case "SET_ACTIVE_VIEW": return { ...s, activeViewId: a.viewId };
    case "SET_LABEL":       return { ...s, selectedLabel: a.label };
    case "VIEW_ADDED":
      return { ...s, views: [...s.views, a.view],
               activeViewId: s.activeViewId ?? a.view.id, saving: false };
    case "VIEW_CALIBRATED":
      return { ...s, saving: false,
               views: s.views.map(v => v.id === a.view.id ? a.view : v) };
    case "KEYPOINT_UPSERTED":
      return { ...s, saving: false,
               keypoints: s.keypoints.some(k => k.id === a.keypoint.id)
                 ? s.keypoints.map(k => k.id === a.keypoint.id ? a.keypoint : k)
                 : [...s.keypoints, a.keypoint] };
    case "CLICK_ADDED":
      return { ...s, clicks: [...s.clicks, a.click] };
    case "CLICK_UPDATED":
      return { ...s, clicks: s.clicks.map(c => c.id === a.click.id ? a.click : c) };
    case "KEYPOINT_DELETED":
      return { ...s, keypoints: s.keypoints.filter(k => k.id !== a.id),
               clicks: s.clicks.filter(c => c.keypoint_3d_id !== a.id) };
    case "SAVING": return { ...s, saving: true, error: null };
    case "DONE":   return { ...s, saving: false };
    case "ERROR":  return { ...s, saving: false, error: a.message };
    default: return s;
  }
}

// ── Hook ───────────────────────────────────────────────────────

export function use3DSession(sessionId: string) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: session }, { data: views }, { data: keypoints }, { data: clicks }] = await Promise.all([
        supabase.from("measurement_sessions").select("mat_grid_cm").eq("id", sessionId).single(),
        supabase.from("session_views").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("keypoints_3d").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("view_clicks").select("*, keypoints_3d!inner(session_id)").eq("keypoints_3d.session_id", sessionId),
      ]);
      dispatch({
        type: "LOADED",
        views: views ?? [],
        keypoints: keypoints ?? [],
        clicks: clicks ?? [],
        matGridCm: session?.mat_grid_cm ?? 10,
      });
    }
    load();
  }, [sessionId]);

  // ── ビュー追加（画像アップロード） ──────────────────────────
  const addView = useCallback(async (viewType: ViewType, file: File) => {
    dispatch({ type: "SAVING" });

    const { data: viewRecord, error: insertErr } = await supabase
      .from("session_views")
      .insert({ session_id: sessionId, view_type: viewType, image_url: null, pixels_per_cm: null } as SessionViewInsert)
      .select().single();

    if (insertErr || !viewRecord) {
      dispatch({ type: "ERROR", message: "ビュー作成失敗: " + insertErr?.message }); return;
    }

    const ext = file.name.split(".").pop();
    const path = `${sessionId}/3d_${viewType}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("sessions").upload(path, file, { upsert: true });
    if (uploadErr) {
      dispatch({ type: "ERROR", message: "アップロード失敗: " + uploadErr.message }); return;
    }

    const { data: urlData } = supabase.storage.from("sessions").getPublicUrl(path);
    const { data: updated } = await supabase
      .from("session_views").update({ image_url: urlData.publicUrl }).eq("id", viewRecord.id).select().single();

    dispatch({ type: "VIEW_ADDED", view: updated ?? { ...viewRecord, image_url: urlData.publicUrl } });
  }, [sessionId]);

  // ── キャリブレーション ────────────────────────────────────
  const calibrateView = useCallback(async (
    viewId: string, pixelDist: number, knownCm: number
  ) => {
    dispatch({ type: "SAVING" });
    const pixels_per_cm = pixelDist / knownCm;
    const { data, error } = await supabase
      .from("session_views").update({ pixels_per_cm }).eq("id", viewId).select().single();
    if (error || !data) { dispatch({ type: "ERROR", message: "キャリブレーション失敗" }); return; }
    dispatch({ type: "VIEW_CALIBRATED", view: data });
  }, []);

  // ── スケールリセット ──────────────────────────────────────
  const resetScale = useCallback(async (viewId: string) => {
    dispatch({ type: "SAVING" });
    const { data, error } = await supabase
      .from("session_views").update({ pixels_per_cm: null }).eq("id", viewId).select().single();
    if (error || !data) { dispatch({ type: "ERROR", message: "リセット失敗" }); return; }
    dispatch({ type: "VIEW_CALIBRATED", view: data });
  }, []);

  // ── キーポイント配置（クリック） ─────────────────────────
  const placeClick = useCallback(async (
    viewId: string, pixelX: number, pixelY: number,
    imgW: number, imgH: number,
    axisFlip?: { px_inverted?: boolean; py_inverted?: boolean }
  ) => {
    const view = state.views.find(v => v.id === viewId);
    if (!view?.pixels_per_cm) {
      dispatch({ type: "ERROR", message: "先にこのビューのスケールを設定してください" }); return;
    }
    dispatch({ type: "SAVING" });

    const baseMap = VIEW_AXIS_MAP[view.view_type];
    const mapOverride = axisFlip
      ? { ...baseMap, ...axisFlip }
      : undefined;
    const partial = pixelToWorld(pixelX, pixelY, view.view_type, view.pixels_per_cm, imgW, imgH, mapOverride);
    const existing = state.keypoints.find(k => k.label === state.selectedLabel);

    let keypoint: Keypoint3D;
    if (existing) {
      const merged = merge3DPoint(existing, partial);
      const { data, error } = await supabase
        .from("keypoints_3d").update(merged).eq("id", existing.id).select().single();
      if (error || !data) { dispatch({ type: "ERROR", message: "更新失敗" }); return; }
      keypoint = data;
    } else {
      const insert: Keypoint3DInsert = {
        session_id: sessionId, label: state.selectedLabel,
        x_cm: partial.x_cm ?? null, y_cm: partial.y_cm ?? null, z_cm: partial.z_cm ?? null,
      };
      const { data, error } = await supabase
        .from("keypoints_3d").insert(insert).select().single();
      if (error || !data) { dispatch({ type: "ERROR", message: "作成失敗" }); return; }
      keypoint = data;
    }

    // 同じビュー×キーポイントの既存 click があれば上書き、なければ新規作成
    const existingClick = state.clicks.find(
      c => c.view_id === viewId && c.keypoint_3d_id === keypoint.id
    );

    dispatch({ type: "KEYPOINT_UPSERTED", keypoint });

    if (existingClick) {
      const { data: click } = await supabase
        .from("view_clicks")
        .update({ pixel_x: pixelX, pixel_y: pixelY })
        .eq("id", existingClick.id)
        .select().single();
      if (click) dispatch({ type: "CLICK_UPDATED", click });
    } else {
      const { data: click } = await supabase
        .from("view_clicks")
        .insert({ keypoint_3d_id: keypoint.id, view_id: viewId, pixel_x: pixelX, pixel_y: pixelY })
        .select().single();
      if (click) dispatch({ type: "CLICK_ADDED", click });
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }, [state.views, state.keypoints, state.selectedLabel, sessionId]);

  // ── キーポイント削除 ──────────────────────────────────────
  const deleteKeypoint = useCallback(async (id: string) => {
    await supabase.from("keypoints_3d").delete().eq("id", id);
    dispatch({ type: "KEYPOINT_DELETED", id });
  }, []);

  return {
    ...state,
    savedFlash,
    addView,
    calibrateView,
    resetScale,
    placeClick,
    deleteKeypoint,
    setActiveView: (id: string) => dispatch({ type: "SET_ACTIVE_VIEW", viewId: id }),
    setLabel: (label: string) => dispatch({ type: "SET_LABEL", label }),
    activeView: state.views.find(v => v.id === state.activeViewId) ?? null,
  };
}
