# API 設計書 — 犬用車椅子採寸プラットフォーム

## Phase 1: Supabase クライアント直接アクセス

Phase 1 では FastAPI バックエンドを持たず、フロントエンドから Supabase JS SDK を直接使用する。

### データアクセスパターン

```ts
// 犬一覧取得
supabase.from('dogs').select('*').order('created_at', { ascending: false })

// 犬登録
supabase.from('dogs').insert({ name, breed, weight_kg, birth_date, notes })

// セッション作成
supabase.from('measurement_sessions').insert({ dog_id, mat_grid_cm, notes })

// 画像アップロード
supabase.storage.from('sessions').upload(`${sessionId}/image.jpg`, file)

// セッション更新（スケール設定後）
supabase.from('measurement_sessions').update({ image_url, pixels_per_cm }).eq('id', sessionId)

// 採寸追加
supabase.from('measurements').insert({ session_id, label, point_a, point_b, value_cm })

// 採寸一覧取得
supabase.from('measurements').select('*').eq('session_id', sessionId).order('created_at')

// エクスポート用（dog + session + measurements を結合）
supabase
  .from('measurement_sessions')
  .select('*, dogs(*), measurements(*)')
  .eq('id', sessionId)
  .single()
```

---

## Phase 2+: FastAPI エンドポイント仕様

Phase 2 以降で追加する REST API。ベース URL: `https://api.example.com/v1`

### ArUco 検出（Phase 2）

```
POST /api/v1/sessions/{session_id}/detect-aruco
Content-Type: multipart/form-data

Request:
  image: File

Response:
{
  "corners": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]],  // 四隅マーカー座標
  "pixels_per_cm": 24.58,
  "homography_matrix": [[...], [...], [...]]
}
```

### 犬キーポイント推定（Phase 3）

```
POST /api/v1/sessions/{session_id}/estimate-keypoints
Content-Type: application/json

Request:
{
  "image_url": "https://..."
}

Response:
{
  "keypoints": {
    "nose":        {"x": 120, "y": 80,  "confidence": 0.95},
    "neck":        {"x": 180, "y": 100, "confidence": 0.92},
    "shoulder":    {"x": 220, "y": 130, "confidence": 0.88},
    "back_top":    {"x": 280, "y": 110, "confidence": 0.85},
    "chest_bottom":{"x": 230, "y": 200, "confidence": 0.80},
    "hip":         {"x": 340, "y": 120, "confidence": 0.87},
    "tail_base":   {"x": 380, "y": 130, "confidence": 0.90},
    "front_paw":   {"x": 210, "y": 280, "confidence": 0.78},
    "rear_paw":    {"x": 360, "y": 280, "confidence": 0.75}
  },
  "model_version": "mmpose-dog-v1"
}
```

### 歩行解析（Phase 5）

```
POST /api/v1/sessions/{session_id}/analyze-gait
Content-Type: application/json

Request:
{
  "video_url": "https://..."
}

Response:
{
  "stride_length_cm": 28.5,
  "gait_cycle_sec": 0.85,
  "left_right_asymmetry": 0.12,
  "vertical_displacement_cm": 2.3,
  "drag_detected": false,
  "frame_count": 240,
  "fps": 30
}
```

### 車椅子推薦（Phase 7）

```
POST /api/v1/recommendations
Content-Type: application/json

Request:
{
  "dog_id": "uuid",
  "session_id": "uuid"
}

Response:
{
  "recommended_size": "M",
  "confidence": 0.87,
  "dimensions": {
    "frame_width_cm": 18,
    "frame_length_cm": 32,
    "wheel_diameter_cm": 20,
    "axle_height_cm": 12
  },
  "similar_cases": 42
}
```

---

## エラーレスポンス共通形式

```json
{
  "error": {
    "code": "IMAGE_TOO_SMALL",
    "message": "画像の解像度が低すぎます（最低 800x600px 必要）"
  }
}
```
