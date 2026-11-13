-- MangoSMP database (SQLite dialect, runs on Turso). Safe to run more than once.
-- The website creates these tables automatically on first use; you do not need to run this by hand.
CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', benefits TEXT NOT NULL DEFAULT '[]',
  price INTEGER, max_qty INTEGER NOT NULL DEFAULT 10, icon TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#ffc82c',
  enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payment_methods(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, mc_username TEXT NOT NULL,
  discord_username TEXT NOT NULL DEFAULT '', items TEXT NOT NULL, total INTEGER NOT NULL,
  payment_method TEXT NOT NULL, payment_info TEXT NOT NULL DEFAULT '', payment_ref TEXT NOT NULL DEFAULT '', discord_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(kind TEXT NOT NULL, ip TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_attempts ON attempts(kind, ip, ts);

-- Starter products. Prices are NULL on purpose: set them in the admin panel.
-- Benefits are empty on purpose: add the real benefits in the admin panel.
INSERT OR IGNORE INTO products(id,category,name,description,benefits,price,max_qty,icon,color,enabled,sort) VALUES
('vip','ranks','VIP','VIP rank for MangoSMP.','[]',NULL,1,'rank-vip','#55ff7a',1,1),
('vip-plus','ranks','VIP+','VIP+ rank for MangoSMP.','[]',NULL,1,'rank-vipplus','#55e1ff',1,2),
('mvp','ranks','MVP','MVP rank for MangoSMP.','[]',NULL,1,'rank-mvp','#ffc82c',1,3),
('mvp-plus','ranks','MVP+','MVP+ rank for MangoSMP.','[]',NULL,1,'rank-mvpplus','#ff55c8',1,4),
('mango','ranks','MANGO','MANGO rank for MangoSMP.','[]',NULL,1,'rank-mango','#ff9d00',1,5),
('common-key','keys','Common Key','Common crate key for MangoSMP.','[]',NULL,64,'key-common','#c9d0d8',1,11),
('prime-key','keys','Prime Key','Prime crate key for MangoSMP.','[]',NULL,64,'key-prime','#3be07a',1,12),
('gold-key','keys','Gold Key','Gold crate key for MangoSMP.','[]',NULL,64,'key-gold','#ffc82c',1,13),
('amethyst-key','keys','Amethyst Key','Amethyst crate key for MangoSMP.','[]',NULL,64,'key-amethyst','#a05bff',1,14),
('crimson-key','keys','Crimson Key','Crimson crate key for MangoSMP.','[]',NULL,64,'key-crimson','#ff3b4e',1,15);
-- A safe default so checkout works on day one. Edit or replace it in the admin panel.
INSERT OR IGNORE INTO payment_methods(id,name,instructions,enabled,sort) VALUES
('discord-ticket','Pay via Discord ticket','After placing your order, open a ticket in the MangoSMP Discord and send your order code. Staff will reply with payment details and confirm once your payment is verified.',1,1);

-- ===== Live player statistics (filled by the MangoStatsSync plugin on your Minecraft server) =====
-- NULL means "the server has not reported this stat". Nothing here is ever made up.
CREATE TABLE IF NOT EXISTS players(
  uuid TEXT PRIMARY KEY, name TEXT NOT NULL, rank_name TEXT,
  kills INTEGER, deaths INTEGER, playtime INTEGER, balance REAL, shards INTEGER, killstreak INTEGER,
  online INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_p_name ON players(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_p_kills ON players(kills);
CREATE INDEX IF NOT EXISTS idx_p_deaths ON players(deaths);
CREATE INDEX IF NOT EXISTS idx_p_playtime ON players(playtime);
CREATE INDEX IF NOT EXISTS idx_p_balance ON players(balance);
CREATE INDEX IF NOT EXISTS idx_p_shards ON players(shards);
CREATE INDEX IF NOT EXISTS idx_p_killstreak ON players(killstreak);
CREATE INDEX IF NOT EXISTS idx_p_online ON players(online);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);

-- ===== Discord login + verified Minecraft link =====
CREATE TABLE IF NOT EXISTS users(
  discord_id TEXT PRIMARY KEY, username TEXT NOT NULL, global_name TEXT, avatar TEXT,
  mc_uuid TEXT, mc_name TEXT, created_at INTEGER NOT NULL, last_login INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mc ON users(mc_uuid) WHERE mc_uuid IS NOT NULL;
CREATE TABLE IF NOT EXISTS link_codes(code TEXT PRIMARY KEY, discord_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_discord ON orders(discord_id);
CREATE TABLE IF NOT EXISTS schema_version(v INTEGER NOT NULL);

-- ===== Admin activity log (who changed what) =====
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
