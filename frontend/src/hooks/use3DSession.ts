"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pixelToWorld, merge3DPoint, VIEW_AXIS_MAP } from "@/lib/coords-3d";
import type {
  SessionView, Keypoint3D, Keypoint3DInsert,
  ViewClick, ViewType,
} from "@/types";

// ── State ──────────────────────────────────────────────────────

type State = {
  views: SessionView[];
  keypoints: Keypoint3D[];
  clicks: ViewClick[];
  activeViewId: string | null;
  selectedLabel: string;
  dogId: string | null;
  createdAt: string | null;
  matWidthCm: number;
  matHeightCm: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const INITIAL: State = {
  views: [], keypoints: [], clicks: [],
  activeViewId: null,
  selectedLabel: "右前足付け根",
  dogId: null,
  createdAt: null,
  matWidthCm: 0,
  matHeightCm: 0,
  loading: true, saving: false, error: null,
};

// ── Actions ────────────────────────────────────────────────────

type Action =
  | { type: "LOADED"; views: SessionView[]; keypoints: Keypoint3D[]; clicks: ViewClick[]; dogId: string | null; createdAt: string | null; matWidthCm: number; matHeightCm: number; initialViewType?: ViewType }
  | { type: "SET_ACTIVE_VIEW"; viewId: string }
  | { type: "SET_LABEL"; label: string }
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
               dogId: a.dogId, createdAt: a.createdAt, matWidthCm: a.matWidthCm, matHeightCm: a.matHeightCm,
               // 指定ビュー（同種が複数なら新しいもの）→ なければ最初のビュー
               activeViewId: ([...a.views].reverse().find(v => v.view_type === a.initialViewType) ?? a.views[0])?.id ?? null,
               loading: false };
    case "SET_ACTIVE_VIEW": return { ...s, activeViewId: a.viewId };
    case "SET_LABEL":       return { ...s, selectedLabel: a.label };
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

// ── 補助 ───────────────────────────────────────────────────────

function sideViewIdSet(views: SessionView[]): Set<string> {
  return new Set(views.filter(v => v.view_type === "side_left" || v.view_type === "side_right").map(v => v.id));
}

// 画像の実寸（座標の原点 = 画像中心の計算に使う）
function loadImageSize(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise(resolve => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ── Hook ───────────────────────────────────────────────────────

export function use3DSession(sessionId: string, initialViewType?: ViewType) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: session }, { data: views }, { data: keypoints }, { data: clicks }] = await Promise.all([
        supabase.from("measurement_sessions").select("dog_id, mat_width_cm, mat_height_cm, created_at").eq("id", sessionId).single(),
        supabase.from("session_views").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("keypoints_3d").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("view_clicks").select("*, keypoints_3d!inner(session_id)").eq("keypoints_3d.session_id", sessionId),
      ]);
      dispatch({
        type: "LOADED",
        initialViewType,
        views: views ?? [],
        keypoints: keypoints ?? [],
        clicks: clicks ?? [],
        dogId: session?.dog_id ?? null,
        createdAt: session?.created_at ?? null,
        matWidthCm: session?.mat_width_cm ?? 0,
        matHeightCm: session?.mat_height_cm ?? 0,
      });
    }
    load();
  }, [sessionId, initialViewType]);

  // ── ビュー追加（画像アップロード） ──────────────────────────
  // ── キャリブレーション ────────────────────────────────────
  const calibrateView = useCallback(async (
    viewId: string, pixelDist: number, knownCm: number,
    axisFlip?: { px_inverted?: boolean; py_inverted?: boolean }
  ) => {
    dispatch({ type: "SAVING" });
    const pixels_per_cm = pixelDist / knownCm;
    const { data, error } = await supabase
      .from("session_views").update({ pixels_per_cm }).eq("id", viewId).select().single();
    if (error || !data) { dispatch({ type: "ERROR", message: "キャリブレーション失敗" }); return; }
    dispatch({ type: "VIEW_CALIBRATED", view: data });

    // スケールを設定し直したら、このビューに置いた点の座標も新しいスケールで計算し直す
    // （しないと古いスケールの座標が残り、写真と3Dがずれる）
    const viewClicks = state.clicks.filter(c => c.view_id === viewId);
    if (viewClicks.length === 0 || !data.image_url) return;
    const size = await loadImageSize(data.image_url);
    if (!size) return;
    const baseMap = VIEW_AXIS_MAP[data.view_type as ViewType];
    const mapOverride = axisFlip ? { ...baseMap, ...axisFlip } : undefined;
    const sideViewIds = sideViewIdSet(state.views);
    for (const click of viewClicks) {
      const kp = state.keypoints.find(k => k.id === click.keypoint_3d_id);
      if (!kp) continue;
      const partial = pixelToWorld(click.pixel_x, click.pixel_y, data.view_type, pixels_per_cm, size.w, size.h, mapOverride);
      if (data.view_type === "top" && state.clicks.some(c => c.keypoint_3d_id === kp.id && sideViewIds.has(c.view_id))) {
        delete partial.x_cm; // X は側面の写真の値を正とする
      }
      const { data: updated } = await supabase
        .from("keypoints_3d").update(merge3DPoint(kp, partial)).eq("id", kp.id).select().single();
      if (updated) dispatch({ type: "KEYPOINT_UPSERTED", keypoint: updated });
    }
  }, [state.clicks, state.keypoints, state.views]);

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
    axisFlip?: { px_inverted?: boolean; py_inverted?: boolean },
    label: string = state.selectedLabel,   // 省略時は選択中の部位
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
    const partial = pixelToWorld(pixelX, pixelY, view.view_type, view.pixels_per_cm!, imgW, imgH, mapOverride);
    const existing = state.keypoints.find(k => k.label === label);

    // 写真ごとに原点（画像中心）も縮尺も違うので、体長 X は側面の写真の値を正とする。
    // 真上の写真は体幅 Y のために使い、その点が側面にもあるなら X は上書きしない
    if (view.view_type === "top" && existing) {
      const sideViewIds = sideViewIdSet(state.views);
      const hasSideClick = state.clicks.some(c => c.keypoint_3d_id === existing.id && sideViewIds.has(c.view_id));
      if (hasSideClick) delete partial.x_cm;
    }

    let keypoint: Keypoint3D;
    if (existing) {
      const merged = merge3DPoint(existing, partial);
      const { data, error } = await supabase
        .from("keypoints_3d").update(merged).eq("id", existing.id).select().single();
      if (error || !data) { dispatch({ type: "ERROR", message: "更新失敗" }); return; }
      keypoint = data;
    } else {
      const insert: Keypoint3DInsert = {
        session_id: sessionId, label,
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
  }, [state.views, state.keypoints, state.clicks, state.selectedLabel, sessionId]);

  // ── キーポイント削除 ──────────────────────────────────────
  const deleteKeypoint = useCallback(async (id: string) => {
    await supabase.from("keypoints_3d").delete().eq("id", id);
    dispatch({ type: "KEYPOINT_DELETED", id });
  }, []);

  return {
    ...state,
    savedFlash,
    calibrateView,
    resetScale,
    placeClick,
    deleteKeypoint,
    setActiveView: (id: string) => dispatch({ type: "SET_ACTIVE_VIEW", viewId: id }),
    setLabel: (label: string) => dispatch({ type: "SET_LABEL", label }),
    activeView: state.views.find(v => v.id === state.activeViewId) ?? null,
  };
}
