-- 採寸値の実測値（手入力）と、3Dモデルへの採用フラグを保存する列
-- 形: {"frontHeight": 24.0, "hindHeight": null, "legDistance": 62.5,
--      "adopt": {"frontHeight": true, "hindHeight": false, "legDistance": true}}
alter table public.measurement_sessions
  add column if not exists manual_metrics jsonb;
