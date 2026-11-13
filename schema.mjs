// Generated from db/schema.sql by the packaging script. Do not edit by hand.
export const SCHEMA_VERSION = 4;
export const SCHEMA = [
 "CREATE TABLE IF NOT EXISTS products(\n  id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,\n  description TEXT NOT NULL DEFAULT '', benefits TEXT NOT NULL DEFAULT '[]',\n  price INTEGER, max_qty INTEGER NOT NULL DEFAULT 10, icon TEXT NOT NULL DEFAULT '',\n  image TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#ffc82c',\n  enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0)",
 "CREATE TABLE IF NOT EXISTS payment_methods(\n  id TEXT PRIMARY KEY, name TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '',\n  enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0)",
 "CREATE TABLE IF NOT EXISTS orders(\n  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, mc_username TEXT NOT NULL,\n  discord_username TEXT NOT NULL DEFAULT '', items TEXT NOT NULL, total INTEGER NOT NULL,\n  payment_method TEXT NOT NULL, payment_info TEXT NOT NULL DEFAULT '', payment_ref TEXT NOT NULL DEFAULT '', discord_id TEXT,\n  status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
 "CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS attempts(kind TEXT NOT NULL, ip TEXT NOT NULL, ts INTEGER NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_attempts ON attempts(kind, ip, ts)",
 "INSERT OR IGNORE INTO products(id,category,name,description,benefits,price,max_qty,icon,color,enabled,sort) VALUES\n('vip','ranks','VIP','VIP rank for MangoSMP.','[]',NULL,1,'rank-vip','#55ff7a',1,1),\n('vip-plus','ranks','VIP+','VIP+ rank for MangoSMP.','[]',NULL,1,'rank-vipplus','#55e1ff',1,2),\n('mvp','ranks','MVP','MVP rank for MangoSMP.','[]',NULL,1,'rank-mvp','#ffc82c',1,3),\n('mvp-plus','ranks','MVP+','MVP+ rank for MangoSMP.','[]',NULL,1,'rank-mvpplus','#ff55c8',1,4),\n('mango','ranks','MANGO','MANGO rank for MangoSMP.','[]',NULL,1,'rank-mango','#ff9d00',1,5),\n('common-key','keys','Common Key','Common crate key for MangoSMP.','[]',NULL,64,'key-common','#c9d0d8',1,11),\n('prime-key','keys','Prime Key','Prime crate key for MangoSMP.','[]',NULL,64,'key-prime','#3be07a',1,12),\n('gold-key','keys','Gold Key','Gold crate key for MangoSMP.','[]',NULL,64,'key-gold','#ffc82c',1,13),\n('amethyst-key','keys','Amethyst Key','Amethyst crate key for MangoSMP.','[]',NULL,64,'key-amethyst','#a05bff',1,14),\n('crimson-key','keys','Crimson Key','Crimson crate key for MangoSMP.','[]',NULL,64,'key-crimson','#ff3b4e',1,15)",
 "INSERT OR IGNORE INTO payment_methods(id,name,instructions,enabled,sort) VALUES\n('discord-ticket','Pay via Discord ticket','After placing your order, open a ticket in the MangoSMP Discord and send your order code. Staff will reply with payment details and confirm once your payment is verified.',1,1)",
 "CREATE TABLE IF NOT EXISTS players(\n  uuid TEXT PRIMARY KEY, name TEXT NOT NULL, rank_name TEXT,\n  kills INTEGER, deaths INTEGER, playtime INTEGER, balance REAL, shards INTEGER, killstreak INTEGER,\n  online INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0)",
 "CREATE INDEX IF NOT EXISTS idx_p_name ON players(name COLLATE NOCASE)",
 "CREATE INDEX IF NOT EXISTS idx_p_kills ON players(kills)",
 "CREATE INDEX IF NOT EXISTS idx_p_deaths ON players(deaths)",
 "CREATE INDEX IF NOT EXISTS idx_p_playtime ON players(playtime)",
 "CREATE INDEX IF NOT EXISTS idx_p_balance ON players(balance)",
 "CREATE INDEX IF NOT EXISTS idx_p_shards ON players(shards)",
 "CREATE INDEX IF NOT EXISTS idx_p_killstreak ON players(killstreak)",
 "CREATE INDEX IF NOT EXISTS idx_p_online ON players(online)",
 "CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS users(\n  discord_id TEXT PRIMARY KEY, username TEXT NOT NULL, global_name TEXT, avatar TEXT,\n  mc_uuid TEXT, mc_name TEXT, created_at INTEGER NOT NULL, last_login INTEGER NOT NULL)",
 "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mc ON users(mc_uuid) WHERE mc_uuid IS NOT NULL",
 "CREATE TABLE IF NOT EXISTS link_codes(code TEXT PRIMARY KEY, discord_id TEXT NOT NULL, expires INTEGER NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_orders_discord ON orders(discord_id)",
 "CREATE TABLE IF NOT EXISTS schema_version(v INTEGER NOT NULL)",
 "CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '')"
];
