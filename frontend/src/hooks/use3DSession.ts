"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pixelToWorld, pixelToWorldH, intersectPlaneZ, merge3DPoint, VIEW_AXIS_MAP } from "@/lib/coords-3d";
import { detectAruco, type NormalizedCorner } from "@/lib/aruco-api";
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
  matWidthCm: number;
  matHeightCm: number;
  markerSizeCm: number;
  viewCorners: Record<string, NormalizedCorner[]>;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const INITIAL: State = {
  views: [], keypoints: [], clicks: [],
  activeViewId: null,
  selectedLabel: "右肩",
  matWidthCm: 0,
  matHeightCm: 0,
  markerSizeCm: 0,
  viewCorners: {},
  loading: true, saving: false, error: null,
};

// ── Actions ────────────────────────────────────────────────────

type Action =
  | { type: "LOADED"; views: SessionView[]; keypoints: Keypoint3D[]; clicks: ViewClick[]; matWidthCm: number; matHeightCm: number; markerSizeCm: number }
  | { type: "SET_ACTIVE_VIEW"; viewId: string }
  | { type: "SET_LABEL"; label: string }
  | { type: "VIEW_ADDED"; view: SessionView }
  | { type: "VIEW_CALIBRATED"; view: SessionView }
  | { type: "KEYPOINT_UPSERTED"; keypoint: Keypoint3D }
  | { type: "CLICK_ADDED"; click: ViewClick }
  | { type: "CLICK_UPDATED"; click: ViewClick }
  | { type: "KEYPOINT_DELETED"; id: string }
  | { type: "VIEW_CORNERS"; viewId: string; corners: NormalizedCorner[] }
  | { type: "SAVING" }
  | { type: "DONE" }
  | { type: "ERROR"; message: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "LOADED":
      return { ...s, views: a.views, keypoints: a.keypoints, clicks: a.clicks,
               matWidthCm: a.matWidthCm, matHeightCm: a.matHeightCm, markerSizeCm: a.markerSizeCm,
               activeViewId: a.views[0]?.id ?? null, loading: false };
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
    case "VIEW_CORNERS":
      return { ...s, viewCorners: { ...s.viewCorners, [a.viewId]: a.corners } };
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
        supabase.from("measurement_sessions").select("mat_width_cm, mat_height_cm, marker_size_cm").eq("id", sessionId).single(),
        supabase.from("session_views").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("keypoints_3d").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("view_clicks").select("*, keypoints_3d!inner(session_id)").eq("keypoints_3d.session_id", sessionId),
      ]);
      dispatch({
        type: "LOADED",
        views: views ?? [],
        keypoints: keypoints ?? [],
        clicks: clicks ?? [],
        matWidthCm: session?.mat_width_cm ?? 0,
        matHeightCm: session?.mat_height_cm ?? 0,
        markerSizeCm: session?.marker_size_cm ?? 0,
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

    const result = await detectAruco(file, state.matWidthCm, state.matHeightCm, state.markerSizeCm);
    if (result) {
      await supabase.from("session_views")
        .update({
          pixels_per_cm: result.pixelsPerCm,
          homography_matrix: result.homography,
          camera_pose: result.cameraPose,
        })
        .eq("id", viewRecord.id);
      dispatch({
        type: "VIEW_ADDED",
        view: {
          ...(updated ?? viewRecord),
          image_url: urlData.publicUrl,
          pixels_per_cm: result.pixelsPerCm,
          homography_matrix: result.homography,
          camera_pose: result.cameraPose,
        },
      });
      dispatch({ type: "VIEW_CORNERS", viewId: viewRecord.id, corners: result.corners });
    } else {
      dispatch({ type: "VIEW_ADDED", view: updated ?? { ...viewRecord, image_url: urlData.publicUrl } });
    }
  }, [sessionId, state.matWidthCm, state.matHeightCm, state.markerSizeCm]);

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
    const partial = view.homography_matrix
      ? pixelToWorldH(pixelX, pixelY, view.homography_matrix, view.view_type,
                      state.matWidthCm, state.matHeightCm, mapOverride)
      : pixelToWorld(pixelX, pixelY, view.view_type, view.pixels_per_cm!, imgW, imgH, mapOverride);
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
  }, [state.views, state.keypoints, state.selectedLabel, sessionId, state.matWidthCm, state.matHeightCm]);

  // ── キーポイント削除 ──────────────────────────────────────
  const deleteKeypoint = useCallback(async (id: string) => {
    await supabase.from("keypoints_3d").delete().eq("id", id);
    dispatch({ type: "KEYPOINT_DELETED", id });
  }, []);

  // ── XY座標補正（手動トリガー） ────────────────────────────
  // トップビューで camera_pose があり、z_cm が既知の場合に
  // Z=z_cm 平面と光線の交点で (x_cm, y_cm) を補正する
  const refineKeypointXY = useCallback(async (keypointId: string) => {
    const kp = state.keypoints.find(k => k.id === keypointId);
    if (!kp || kp.z_cm == null) return;

    const topView = state.views.find(v => v.view_type === "top" && v.camera_pose);
    if (!topView?.camera_pose) return;

    const click = state.clicks.find(c =>
      c.view_id === topView.id && c.keypoint_3d_id === keypointId
    );
    if (!click) return;

    const pt = intersectPlaneZ(click.pixel_x, click.pixel_y, topView.camera_pose, kp.z_cm);
    if (!pt) return;

    // solvePnP ワールド座標 → 体軸座標
    // ワールド X = mat幅方向、ワールド Y = mat奥行き方向（壁から離れる方向）
    // マーカー中心の原点オフセット M=5cm + mat中心への補正
    const MARGIN_CM = 5.0;
    const relX = pt.y - (MARGIN_CM + state.matHeightCm / 2); // 奥行き → 体前後(X軸)
    const relY = pt.x - (MARGIN_CM + state.matWidthCm  / 2); // 幅方向 → 体左右(Y軸)
    const corrected_x = -relX; // px_inverted=true (top view)
    const corrected_y =  relY; // py_inverted=false (top view)

    dispatch({ type: "SAVING" });
    const { data, error } = await supabase
      .from("keypoints_3d")
      .update({ x_cm: corrected_x, y_cm: corrected_y })
      .eq("id", keypointId)
      .select().single();
    if (error || !data) { dispatch({ type: "ERROR", message: "XY補正失敗" }); return; }
    dispatch({ type: "KEYPOINT_UPSERTED", keypoint: data });
  }, [state.keypoints, state.views, state.clicks, state.matWidthCm, state.matHeightCm]);

  return {
    ...state,
    savedFlash,
    addView,
    viewCorners: state.viewCorners,
    calibrateView,
    resetScale,
    placeClick,
    deleteKeypoint,
    refineKeypointXY,
    setActiveView: (id: string) => dispatch({ type: "SET_ACTIVE_VIEW", viewId: id }),
    setLabel: (label: string) => dispatch({ type: "SET_LABEL", label }),
    activeView: state.views.find(v => v.id === state.activeViewId) ?? null,
  };
}
