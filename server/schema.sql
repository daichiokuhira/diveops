-- 潜水現場記録 共有データベース（Cloudflare D1 / SQLite）
-- 記録は「文書」として持つ。種類（kind）ごとに id で1件。新しい方（updated_at）を正とする。
CREATE TABLE IF NOT EXISTS docs (
  kind TEXT NOT NULL,            -- member / qual / incident / diver / dive
  id TEXT NOT NULL,
  data TEXT NOT NULL,            -- JSON
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,      -- 端末で変更した日時（ISO）
  updated_by TEXT NOT NULL,      -- 変更した職員番号（サーバーが入れる）
  server_at TEXT NOT NULL,       -- サーバーが受け取った日時
  seq INTEGER NOT NULL,          -- 受け取った順の番号（差分の取得に使う）
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS docs_seq ON docs (seq);

-- 受け取った順の番号
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', 0);

-- ログインの失敗（総当たりを防ぐ）
CREATE TABLE IF NOT EXISTS login_fail (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_fail_ip ON login_fail (ip, at);

-- 変更の記録（誰が・いつ・何を）。消さずに残す
CREATE TABLE IF NOT EXISTS audit (
  seq INTEGER PRIMARY KEY,
  kind TEXT NOT NULL, id TEXT NOT NULL, deleted INTEGER NOT NULL,
  updated_by TEXT NOT NULL, server_at TEXT NOT NULL, data TEXT NOT NULL
);
