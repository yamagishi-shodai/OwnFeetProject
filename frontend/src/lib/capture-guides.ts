import type { CaptureGuide } from "@/components/capture/MediaCapture";
import type { ViewType } from "@/types";

// ビューごとの撮影ガイド。coords-3d の軸マッピング（頭が画像左）に合わせる
export const CAPTURE_GUIDES: Partial<Record<ViewType, CaptureGuide>> = {
  side_left: {
    title: "犬の左側から撮影してください",
    hints: ["犬の頭が画面の左になるように", "基準物と犬の足先まで画面に入れる"],
    headSide: "left",
  },
  top: {
    title: "犬の真上から撮影してください",
    hints: ["犬の頭が画面の左になるように", "基準物と犬の体全体を画面に入れる"],
    headSide: "left",
  },
};
