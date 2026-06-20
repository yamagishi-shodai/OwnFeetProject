# システム設計書 — 犬用車椅子採寸プラットフォーム

## 概要

飼い主が専用採寸マットの上で犬を撮影し、Webアプリに画像・動画をアップロードすることで、
採寸・歩行解析・車椅子推薦を一貫して行う統合プラットフォーム。

---

## アーキテクチャ概要

```
[ ブラウザ ]
   ↓ HTTPS
[ Next.js (Vercel) ]
   ↓ Supabase JS SDK      ↓ REST (Phase 2+)
[ Supabase ]          [ FastAPI (Python) ]
  DB (PostgreSQL)       OpenCV / MMPose
  Storage               DeepLabCut / PyTorch
  Auth (Phase 2+)
```

### Phase 1（現在）
- **フロントエンド**: Next.js → Supabase 直接アクセス
- **バックエンド**: なし（画像処理・AI は Phase 2 以降）

### Phase 2 以降
- **バックエンド**: FastAPI を追加
- フロントエンドは FastAPI 経由で AI 処理を呼び出す

---

## 技術スタック

| レイヤー | 技術 | 採用理由 |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR/ISR・型安全・エコシステム |
| Styling | Tailwind CSS | ユーティリティクラスで高速開発 |
| Database | PostgreSQL (Supabase) | リレーショナル・JSONBサポート |
| Storage | Supabase Storage | 画像・動画の一元管理 |
| Auth | Supabase Auth (Phase 2+) | Row Level Security と統合 |
| AI Backend | FastAPI + Python | OpenCV/MMPose/DeepLabCut との親和性 |
| AI/CV | OpenCV, MMPose, DeepLabCut, PyTorch | 犬のキーポイント推定・歩行解析 |
| Deploy | Vercel (frontend) + Cloud Run (backend) | - |

---

## フェーズ別方針

| Phase | 概要 | AI | Backend |
|---|---|---|---|
| 1 | 手動採寸 MVP | なし | なし |
| 2 | 採寸マット自動認識 | OpenCV (ArUco) | FastAPI |
| 3 | 犬キーポイント推定 | MMPose | FastAPI |
| 4 | 専用モデル学習 | DeepLabCut | FastAPI |
| 5 | 動画歩行解析 | PyTorch | FastAPI |
| 6 | 車椅子適合評価 | 統計モデル | FastAPI |
| 7 | 車椅子サイズ推薦 | ML推薦 | FastAPI |
| 8 | 車椅子設計支援 | 生成AI | FastAPI |

---

## 設計思想

1. **AIは補助** — 採寸マットで再現性を先に確保する
2. **AI後付け可能** — Phase 1 のデータ構造が Phase 4+ の学習データになる
3. **型設計重視** — `types/index.ts` でドメインモデルを一元管理
4. **データ蓄積** — 元画像・キーポイント・手動修正結果をすべて保存する

---

## セキュリティ方針

- **Phase 1**: RLS 有効・`anon` ロールに全操作ポリシーを付与（認証なし MVP）
- **Phase 2**: Supabase Auth 導入 → anon ポリシーを削除し `authenticated` + `owner_id` ポリシーへ差し替え
- 画像 URL は Supabase Storage の署名付き URL を利用（Phase 2+）
