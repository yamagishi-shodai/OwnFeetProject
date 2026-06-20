"use client";

import { useEffect, useReducer, useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { calcPixelDistance, pixelsToCm } from "@/lib/measurement-calc";
import type {
  MeasurementSession,
  Measurement,
  MeasurementMode,
  Point,
} from "@/types";

// ── State ──────────────────────────────────────────────────────

type State = {
  session: MeasurementSession | null;
  measurements: Measurement[];
  mode: MeasurementMode;
  pendingFirst: Point | null;   // 最初にクリックした点
  selectedLabel: string;
  calibrateKnownCm: number;     // キャリブレーション用 既知距離(cm)
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const INITIAL: State = {
  session: null,
  measurements: [],
  mode: "calibrate",
  pendingFirst: null,
  selectedLabel: "胴長",
  calibrateKnownCm: 10,
  loading: true,
  saving: false,
  error: null,
};

// ── Actions ────────────────────────────────────────────────────

type Action =
  | { type: "LOADED"; session: MeasurementSession; measurements: Measurement[] }
  | { type: "SET_MODE"; mode: MeasurementMode }
  | { type: "SET_LABEL"; label: string }
  | { type: "SET_KNOWN_CM"; cm: number }
  | { type: "CLICK_FIRST"; point: Point }
  | { type: "CANCEL_FIRST" }
  | { type: "SAVING" }
  | { type: "CALIBRATED"; session: MeasurementSession }
  | { type: "MEASURED"; measurement: Measurement }
  | { type: "DELETE_MEASUREMENT"; id: string }
  | { type: "ERROR"; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOADED":
      return {
        ...state,
        session: action.session,
        measurements: action.measurements,
        mode: action.session.pixels_per_cm ? "measure" : "calibrate",
        loading: false,
      };
    case "SET_MODE":
      return { ...state, mode: action.mode, pendingFirst: null };
    case "SET_LABEL":
      return { ...state, selectedLabel: action.label };
    case "SET_KNOWN_CM":
      return { ...state, calibrateKnownCm: action.cm };
    case "CLICK_FIRST":
      return { ...state, pendingFirst: action.point };
    case "CANCEL_FIRST":
      return { ...state, pendingFirst: null };
    case "SAVING":
      return { ...state, saving: true, error: null };
    case "CALIBRATED":
      return { ...state, saving: false, session: action.session, mode: "measure", pendingFirst: null };
    case "MEASURED":
      return {
        ...state,
        saving: false,
        measurements: [...state.measurements, action.measurement],
        pendingFirst: null,
      };
    case "DELETE_MEASUREMENT":
      return { ...state, measurements: state.measurements.filter((m) => m.id !== action.id) };
    case "ERROR":
      return { ...state, saving: false, error: action.message };
    default:
      return state;
  }
}

// ── Hook ───────────────────────────────────────────────────────

export function useMeasurement(sessionId: string) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  useEffect(() => {
    async function load() {
      const [{ data: session }, { data: measurements }] = await Promise.all([
        supabase.from("measurement_sessions").select("*").eq("id", sessionId).single(),
        supabase
          .from("measurements")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at"),
      ]);
      if (session) {
        dispatch({ type: "LOADED", session, measurements: measurements ?? [] });
      } else {
        dispatch({ type: "ERROR", message: "セッションが見つかりません" });
      }
    }
    load();
  }, [sessionId]);

  // キャリブレーション: 2点目クリック時
  const handleCalibrateSecond = useCallback(
    async (second: Point) => {
      if (!state.pendingFirst || !state.session) return;
      dispatch({ type: "SAVING" });

      const pixelDist = calcPixelDistance(state.pendingFirst, second);
      const pixels_per_cm = pixelDist / state.calibrateKnownCm;

      const { data, error } = await supabase
        .from("measurement_sessions")
        .update({ pixels_per_cm })
        .eq("id", sessionId)
        .select()
        .single();

      if (error || !data) {
        dispatch({ type: "ERROR", message: "スケール保存に失敗しました" });
      } else {
        dispatch({ type: "CALIBRATED", session: data });
      }
    },
    [state.pendingFirst, state.session, state.calibrateKnownCm, sessionId]
  );

  // 採寸: 2点目クリック時
  const handleMeasureSecond = useCallback(
    async (second: Point) => {
      if (!state.pendingFirst || !state.session?.pixels_per_cm) return;
      dispatch({ type: "SAVING" });

      const pixelDist = calcPixelDistance(state.pendingFirst, second);
      const value_cm = parseFloat(
        pixelsToCm(pixelDist, state.session.pixels_per_cm).toFixed(2)
      );

      const { data, error } = await supabase
        .from("measurements")
        .insert({
          session_id: sessionId,
          label: state.selectedLabel,
          point_a: state.pendingFirst,
          point_b: second,
          value_cm,
        })
        .select()
        .single();

      if (error || !data) {
        dispatch({ type: "ERROR", message: "採寸保存に失敗しました" });
      } else {
        dispatch({ type: "MEASURED", measurement: data });
        flashSaved();
      }
    },
    [state.pendingFirst, state.session, state.selectedLabel, sessionId]
  );

  // ── 保存フィードバック ─────────────────────────────────────
  const [savedFlash, setSavedFlash] = useState(false);
  function flashSaved() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }

  // canvas クリックの統合ハンドラ
  const handleCanvasClick = useCallback(
    (point: Point) => {
      if (state.pendingFirst === null) {
        dispatch({ type: "CLICK_FIRST", point });
      } else {
        if (state.mode === "calibrate") {
          handleCalibrateSecond(point);
        } else {
          handleMeasureSecond(point);
        }
      }
    },
    [state.pendingFirst, state.mode, handleCalibrateSecond, handleMeasureSecond]
  );

  async function deleteMeasurement(id: string) {
    await supabase.from("measurements").delete().eq("id", id);
    dispatch({ type: "DELETE_MEASUREMENT", id });
  }

  return {
    ...state,
    savedFlash,
    dispatch,
    handleCanvasClick,
    deleteMeasurement,
    setMode: (mode: MeasurementMode) => dispatch({ type: "SET_MODE", mode }),
    setLabel: (label: string) => dispatch({ type: "SET_LABEL", label }),
    setKnownCm: (cm: number) => dispatch({ type: "SET_KNOWN_CM", cm }),
    cancelFirst: () => dispatch({ type: "CANCEL_FIRST" }),
  };
}
