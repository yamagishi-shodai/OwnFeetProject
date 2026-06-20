# ディレクトリ構成

```
OwnFeetProject/
├── frontend/                          # Next.js 14 (App Router)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx             # ルートレイアウト（ヘッダー・フォント）
│   │   │   ├── page.tsx               # / 犬一覧
│   │   │   ├── dogs/
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx       # /dogs/new 犬登録
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx       # /dogs/[id] 犬詳細・セッション履歴
│   │   │   └── sessions/
│   │   │       ├── new/
│   │   │       │   └── page.tsx       # /sessions/new 画像アップロード
│   │   │       └── [id]/
│   │   │           ├── page.tsx       # /sessions/[id] 採寸ツール
│   │   │           └── export/
│   │   │               └── page.tsx   # /sessions/[id]/export JSON エクスポート
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   └── Input.tsx
│   │   │   └── measurement/
│   │   │       ├── MeasurementCanvas.tsx   # canvas + ポインター操作
│   │   │       ├── MeasurementList.tsx     # 採寸結果一覧
│   │   │       └── LabelSelector.tsx       # 採寸ラベル選択
│   │   ├── types/
│   │   │   └── index.ts               # Dog, MeasurementSession, Measurement 等
│   │   ├── lib/
│   │   │   ├── supabase.ts            # createBrowserClient
│   │   │   └── measurement-calc.ts    # calcDistance, pixelsToCm
│   │   └── hooks/
│   │       ├── useDogs.ts             # 犬 CRUD
│   │       └── useMeasurement.ts      # canvas 状態管理（mode, points, scale）
│   ├── public/
│   │   └── img/
│   ├── tailwind.config.ts
│   ├── .env.local.example
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                           # FastAPI（Phase 2 以降）
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── aruco.py           # Phase 2
│   │   │       ├── keypoints.py       # Phase 3
│   │   │       └── gait.py            # Phase 5
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   ├── requirements.txt
│   └── .gitkeep
│
├── docs/
│   ├── system-design.md
│   ├── er-diagram.md
│   ├── api-design.md
│   ├── directory-structure.md
│   └── roadmap.md
│
└── start.md
```

## ファイル命名規則

| 種類 | 規則 | 例 |
|---|---|---|
| React コンポーネント | PascalCase | `MeasurementCanvas.tsx` |
| hooks | camelCase, use プレフィックス | `useMeasurement.ts` |
| lib ユーティリティ | kebab-case | `measurement-calc.ts` |
| 型定義 | PascalCase（型名） | `type Dog = {...}` |
| Supabase テーブル | snake_case | `measurement_sessions` |
