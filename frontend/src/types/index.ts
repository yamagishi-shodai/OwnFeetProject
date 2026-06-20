// ── ドメインモデル ─────────────────────────────────────────────

export type Dog = {
  id: string;
  name: string;
  breed: string | null;
  weight_kg: number | null;
  birth_date: string | null;
  notes: string | null;
  created_at: string;
};

export type DogInsert = Omit<Dog, "id" | "created_at">;

export type Point = {
  x: number;
  y: number;
};

export type CameraPose = {
  C: [number, number, number];
  RT_Kinv: number[];
};

export type MeasurementSession = {
  id: string;
  dog_id: string;
  image_url: string | null;
  pixels_per_cm: number | null;
  mat_grid_cm: number;
  mat_width_cm: number;
  mat_height_cm: number;
  marker_size_cm: number;
  notes: string | null;
  created_at: string;
};

export type MeasurementSessionInsert = Omit<MeasurementSession, "id" | "created_at">;

export type Measurement = {
  id: string;
  session_id: string;
  label: string;
  point_a: Point;
  point_b: Point;
  value_cm: number;
  created_at: string;
};

export type MeasurementInsert = Omit<Measurement, "id" | "created_at">;

// ── エクスポート用集約型 ────────────────────────────────────────

export type SessionExport = {
  exported_at: string;
  dog: Dog;
  session: MeasurementSession;
  measurements: Measurement[];
};

// ── canvas 状態 ────────────────────────────────────────────────

export type MeasurementMode = "calibrate" | "measure" | "view";

export type PendingPoints = {
  first: Point | null;
  second: Point | null;
};

// ── 3D キーポイント ────────────────────────────────────────────

export type ViewType = "top" | "side_left" | "side_right" | "front" | "back";

export const VIEW_LABELS: Record<ViewType, string> = {
  top:        "真上",
  side_left:  "左側面",
  side_right: "右側面",
  front:      "正面",
  back:       "背面",
};

export type SessionView = {
  id: string;
  session_id: string;
  view_type: ViewType;
  image_url: string | null;
  pixels_per_cm: number | null;
  homography_matrix: number[] | null;
  camera_pose: CameraPose | null;
  created_at: string;
};

export type SessionViewInsert = Omit<SessionView, "id" | "created_at">;

export type Keypoint3D = {
  id: string;
  session_id: string;
  label: string;
  x_cm: number | null;
  y_cm: number | null;
  z_cm: number | null;
  created_at: string;
};

export type Keypoint3DInsert = Omit<Keypoint3D, "id" | "created_at">;

export type ViewClick = {
  id: string;
  keypoint_3d_id: string;
  view_id: string;
  pixel_x: number;
  pixel_y: number;
};

// ── Supabase Database 型 ────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      dogs: {
        Row: Dog;
        Insert: DogInsert;
        Update: Partial<DogInsert>;
      };
      measurement_sessions: {
        Row: MeasurementSession;
        Insert: MeasurementSessionInsert;
        Update: Partial<MeasurementSessionInsert>;
      };
      measurements: {
        Row: Measurement;
        Insert: MeasurementInsert;
        Update: Partial<MeasurementInsert>;
      };
    };
  };
};
