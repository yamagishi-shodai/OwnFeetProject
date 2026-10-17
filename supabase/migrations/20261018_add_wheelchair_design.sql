-- 車椅子設計（後脚サポート型・2輪）で手入力した設計値を保存する列。空の項目は採寸値からの自動計算を使う
-- 形: {"frameLength": 32.0, "frameWidth": null, "saddleHeight": 21.5, "frontSupportHeight": null, "wheelDiameter": 20.0}
alter table public.measurement_sessions
  add column if not exists wheelchair_design jsonb;
