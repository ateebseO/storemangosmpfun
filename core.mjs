// MangoSMP API (Netlify Functions + Turso). Secrets come from environment variables, never from the browser.
import { webcrypto } from "node:crypto";
const crypto = globalThis.crypto ?? webcrypto; // works on every Node version Netlify may use
const enc = new TextEncoder();
class Err extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const J = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...h } });
const ST = ["pending", "submitted", "paid", "delivered", "cancelled", "refunded"];
const now = () => Math.floor(Date.now() / 1000);
const rnd = (n, al) => [...crypto.getRandomValues(new Uint8Array(n))].map(x => al[x % al.length]).join("");
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "item";
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const MC = /^\.?[A-Za-z0-9_]{3,16}$/;
const secretOk = env => !!env.SESSION_SECRET && env.SESSION_SECRET.length >= 32;
const pwOk = env => !!env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12;
const strength = (v, min) => !v ? "missing" : v.length < min ? "too_short" : "ok";

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

async function isAdmin(req, env) {
  if (!secretOk(env)) return false;
  const c = (req.headers.get("Cookie") || "").split(/;\s*/).find(x => x.startsWith("mango_admin="));
  const parts = c ? c.slice(12).split(".") : [];
  if (parts.length !== 3 || !(+parts[0] > now())) return false;
  return safeEq(parts[2], await hmac(env.SESSION_SECRET, parts[0] + "." + parts[1]));
}
const ip = r => r.headers.get("x-nf-client-connection-ip") || r.headers.get("CF-Connecting-IP") || "local";
const limited = async (env, kind, who, max, win) =>
  (await env.DB.prepare("SELECT COUNT(*) n FROM attempts WHERE kind=?1 AND ip=?2 AND ts>?3").bind(kind, who, now() - win).first()).n >= max;
const hit = async (env, kind, who) => {
  await env.DB.prepare("INSERT INTO attempts(kind,ip,ts) VALUES(?1,?2,?3)").bind(kind, who, now()).run();
  await env.DB.prepare("DELETE FROM attempts WHERE ts<?1").bind(now() - 86400).run();
};

const pub = r => ({ id: r.id, category: r.category, name: r.name, description: r.description, benefits: JSON.parse(r.benefits || "[]"), price: r.price, max_qty: r.max_qty, icon: r.icon, image: r.image, color: r.color, enabled: r.enabled, sort: r.sort, available: !!r.enabled && r.price != null });
const payPub = r => ({ id: r.id, name: r.name, instructions: r.instructions, enabled: r.enabled, sort: r.sort });
const orderPub = r => ({ id: r.id, code: r.code, mc_username: r.mc_username, discord_username: r.discord_username, items: JSON.parse(r.items), total: r.total, payment_method: r.payment_method, payment_info: r.payment_info, payment_ref: r.payment_ref, discord_id: r.discord_id || null, status: r.status, note: r.note, created_at: r.created_at, updated_at: r.updated_at });

function cleanProduct(b) {
  const name = str(b.name, 60); if (!name) throw new Err("Name is required");
  if (!["ranks", "keys"].includes(b.category)) throw new Err("Choose a category");
  let price = null;
  if (b.price !== null && b.price !== "" && b.price !== undefined) {
    price = Number(b.price);
    if (!Number.isInteger(price) || price < 1 || price > 10000000) throw new Err("Price must be a whole number of PKR (1 to 10,000,000), or empty if not set");
  }
  const mq = Number(b.max_qty ?? 10); if (!Number.isInteger(mq) || mq < 1 || mq > 999) throw new Err("Max quantity must be 1 to 999");
  return {
    name, category: b.category, description: str(b.description, 600),
    benefits: JSON.stringify((Array.isArray(b.benefits) ? b.benefits : []).map(x => str(x, 120)).filter(Boolean).slice(0, 30)),
    price, max_qty: mq, color: /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#ffc82c",
    icon: /^[\w-]{0,40}$/.test(b.icon || "") ? (b.icon || "") : "",
    image: /^\/api\/image\/[0-9a-f]{16,40}$/.test(b.image || "") ? b.image : "",
    enabled: b.enabled ? 1 : 0, sort: Number.isInteger(Number(b.sort)) ? Number(b.sort) : 0
  };
}
function cleanPay(b) {
  const name = str(b.name, 60); if (!name) throw new Err("Name is required");
  return { name, instructions: str(b.instructions, 1500), enabled: b.enabled ? 1 : 0, sort: Number.isInteger(Number(b.sort)) ? Number(b.sort) : 0 };
}



/* ---------- Discord login helpers ---------- */
const getCookie = (req, name) => { const c = (req.headers.get("Cookie") || "").split(/;\s*/).find(x => x.startsWith(name + "=")); return c ? c.slice(name.length + 1) : ""; };
const cookie = (name, val, maxAge) => `${name}=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const redirect = (loc, cookies = []) => { const h = new Headers({ Location: loc, "Cache-Control": "no-store" }); cookies.forEach(c => h.append("Set-Cookie", c)); return new Response(null, { status: 302, headers: h }); };
async function sessionUser(req, env) {
  if (!secretOk(env)) return null;
  const parts = getCookie(req, "mango_user").split(".");
  if (parts.length !== 3 || !(+parts[0] > now()) || !/^\d{5,25}$/.test(parts[1])) return null;
  return safeEq(parts[2], await hmac(env.SESSION_SECRET, "u." + parts[0] + "." + parts[1])) ? parts[1] : null;
}
const avatarUrl = u => u.avatar ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.discord_id) >> 22n) % 6n)}.png`;
const userPub = u => ({ id: u.discord_id, name: u.global_name || u.username, username: u.username, avatar_url: avatarUrl(u) });
async function statsAuth(req, env) {
  const keys = [env.STATS_API_KEY, env.STATS_API_KEY_NEXT].filter(k => k && k.length >= 24);
  if (!keys.length) throw new Err("Stats sync is not configured. Set STATS_API_KEY (24+ characters).", 503);
  const who = ip(req);
  if (await limited(env, "ingest", who, 20, 900)) throw new Err("Too many failed attempts", 429);
  const probe = await hmac(keys[0], (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  let ok = false;
  for (const k of keys) if (safeEq(probe, await hmac(keys[0], k))) ok = true;
  if (!ok) { await hit(env, "ingest", who); throw new Err("Unauthorized", 401); }
}
async function adminActor(req, env, DB) {
  if (await isAdmin(req, env)) return "password";
  const id = await sessionUser(req, env);
  if (id && String(env.ADMIN_DISCORD_IDS || "").split(/[,\s]+/).includes(id)) { const u = await DB.prepare("SELECT username FROM users WHERE discord_id=?1").bind(id).first(); return "discord:" + (u ? u.username : id); }
  return null;
}
const audit = (DB, actor, action, detail = "") => DB.prepare("INSERT INTO audit_log(ts,actor,action,detail) VALUES(?1,?2,?3,?4)").bind(now(), actor, action, String(detail).slice(0, 300)).run();

/* ---------- live stats helpers ---------- */
const CATS = { kills: { col: "kills" }, deaths: { col: "deaths" }, playtime: { col: "playtime" }, balance: { col: "balance" }, shards: { col: "shards" }, killstreak: { col: "killstreak" }, online: { col: "playtime", online: true } };
const STALE = 1800, PAGE = 20, UU = /^[0-9a-f]{32}$/;
const normU = s => String(s || "").toLowerCase().replace(/-/g, "");
const pnum = (v, k, i) => { if (v === undefined || v === null) return null; const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e15) throw new Err(`players[${i}].${k} must be a number between 0 and 1e15`); return n; };
const pubP = r => ({ uuid: r.uuid, name: r.name, rank: r.rank_name || "", kills: r.kills, deaths: r.deaths, playtime: r.playtime, balance: r.balance, shards: r.shards, killstreak: r.killstreak, online: !!r.online, last_seen: r.last_seen });
async function statsMeta(DB) {
  const m = Object.fromEntries((await DB.prepare("SELECT k,v FROM meta").all()).results.map(r => [r.k, r.v]));
  const last = Number(m.last_sync) || 0;
  return { last_sync: last, online_count: m.online_count == null ? null : Number(m.online_count), has_data: last > 0, stale: last > 0 && now() - last > STALE };
}
const CACHE = { "Cache-Control": "public, max-age=20" };

export async function onRequest({ request: req, env, params }) {
  const p = (params.path || []).join("/"), m = req.method, url = new URL(req.url), DB = env.DB;
  try {
    if (p === "health" && m === "GET") {
      let db = DB ? "ok" : env.DB_ERROR ? "unreachable" : "not_configured", last = null;
      if (DB) { try { await DB.prepare("SELECT 1 x").first(); last = (await statsMeta(DB)).last_sync || null; } catch { db = "unreachable"; } }
      const ids = String(env.ADMIN_DISCORD_IDS || "").split(/[,\s]+/).filter(x => /^\d{5,25}$/.test(x));
      const checks = { database: db, admin_password: strength(env.ADMIN_PASSWORD, 12), session_secret: strength(env.SESSION_SECRET, 32), stats_api_key: strength(env.STATS_API_KEY, 24), discord_client_id: env.DISCORD_CLIENT_ID ? "ok" : "missing", discord_client_secret: env.DISCORD_CLIENT_SECRET ? "ok" : "missing", site_url: env.SITE_URL ? "ok" : "missing" };
      return J({ ok: ["database", "admin_password", "session_secret", "stats_api_key"].every(k => checks[k] === "ok"), checks, discord_redirect_uri: (env.SITE_URL ? String(env.SITE_URL).replace(/\/+$/, "") : url.origin) + "/api/auth/discord/callback", admin_discord_ids: ids.length, last_stats_sync: last });
    }
    if (!DB) throw new Err(env.DB_ERROR ? "The database is not reachable. Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Netlify." : "The database is not connected yet. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Netlify.", 503);
    const body = async () => { const txt = await req.text(); if (txt.length > 200000) throw new Err("Request too large", 413); let b = null; try { b = JSON.parse(txt); } catch { } if (!b || typeof b !== "object") throw new Err("Invalid request"); return b; };
    const csrf = () => { if (req.headers.get("X-Requested-With") !== "mangosmp") throw new Err("Forbidden", 403); };

    /* ---------- public ---------- */
    if (p === "store" && m === "GET") {
      const pr = (await DB.prepare("SELECT * FROM products ORDER BY sort,name").all()).results.map(pub);
      const py = (await DB.prepare("SELECT * FROM payment_methods WHERE enabled=1 ORDER BY sort,name").all()).results.map(payPub);
      return J({ products: pr, payments: py });
    }
    if (p.startsWith("image/") && m === "GET") {
      const r = await DB.prepare("SELECT mime,data FROM images WHERE id=?1").bind(p.slice(6)).first();
      if (!r) return new Response("Not found", { status: 404 });
      return new Response(Uint8Array.from(atob(r.data), c => c.charCodeAt(0)), { headers: { "Content-Type": r.mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
    }
    if (p === "orders" && m === "POST") {
      csrf();
      const b = await body(), who = ip(req);
      if (await limited(env, "order", who, 10, 3600)) throw new Err("Too many orders from your connection. Please try again later.", 429);
      const mc = str(b.mc, 17); if (!MC.test(mc)) throw new Err("Enter a valid Minecraft username");
      const did = await sessionUser(req, env); let dname = str(b.discord, 40);
      if (did && !dname) { const du = await DB.prepare("SELECT username FROM users WHERE discord_id=?1").bind(did).first(); dname = du ? du.username : ""; }
      if (b.agree !== true) throw new Err("You must accept the policies to place an order");
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 20) throw new Err("Your cart is empty");
      const want = new Map();
      for (const i of b.items) { const q = Number(i.qty); if (typeof i.id !== "string" || !Number.isInteger(q) || q < 1) throw new Err("Invalid cart"); want.set(i.id, (want.get(i.id) || 0) + q); }
      const ids = [...want.keys()];
      const rows = (await DB.prepare(`SELECT * FROM products WHERE id IN (${ids.map((_, i) => "?" + (i + 1)).join(",")})`).bind(...ids).all()).results;
      if (rows.length !== ids.length) throw new Err("A product in your cart no longer exists");
      let total = 0; const items = [];
      for (const r of rows) {
        const q = want.get(r.id);
        if (!r.enabled || r.price == null) throw new Err(`${r.name} is not available right now`);
        if (q > r.max_qty) throw new Err(`You can buy at most ${r.max_qty} of ${r.name} per order`);
        total += r.price * q; items.push({ id: r.id, name: r.name, qty: q, price: r.price });
      }
      const pay = await DB.prepare("SELECT * FROM payment_methods WHERE id=?1 AND enabled=1").bind(str(b.payment, 60)).first();
      if (!pay) throw new Err("Choose a valid payment method");
      let code, t = now();
      for (let tries = 0; tries < 4; tries++) {
        code = "MNG-" + rnd(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
        try {
          await DB.prepare("INSERT INTO orders(code,mc_username,discord_username,items,total,payment_method,payment_info,status,created_at,updated_at,discord_id) VALUES(?1,?2,?3,?4,?5,?6,?7,'pending',?8,?8,?9)")
            .bind(code, mc, dname, JSON.stringify(items), total, pay.name, pay.instructions, t, did).run();
          break;
        } catch (e) { if (tries === 3) throw e; }
      }
      await hit(env, "order", who);
      return J({ code, total }, 201);
    }
    if (p === "orders/lookup" && m === "GET") {
      const who = ip(req);
      if (await limited(env, "lookup", who, 30, 3600)) throw new Err("Too many lookups. Please try again later.", 429);
      await hit(env, "lookup", who);
      const did = await sessionUser(req, env);
      const r = await DB.prepare("SELECT * FROM orders WHERE code=?1 AND (lower(mc_username)=lower(?2) OR (?3 IS NOT NULL AND discord_id=?3))").bind(str(url.searchParams.get("code"), 20).toUpperCase(), str(url.searchParams.get("mc"), 17), did).first();
      if (!r) throw new Err("No order found with that code and Minecraft username", 404);
      const o = orderPub(r); delete o.id; return J(o);
    }
    if (p === "orders/reference" && m === "POST") {
      csrf();
      const b = await body(), ref = str(b.ref, 80);
      if (ref.length < 4) throw new Err("Enter your payment reference or transaction ID");
      const did = await sessionUser(req, env);
      const r = await DB.prepare("SELECT id,status FROM orders WHERE code=?1 AND (lower(mc_username)=lower(?2) OR (?3 IS NOT NULL AND discord_id=?3))").bind(str(b.code, 20).toUpperCase(), str(b.mc, 17), did).first();
      if (!r) throw new Err("Order not found", 404);
      if (!["pending", "submitted"].includes(r.status)) throw new Err("This order can no longer be updated");
      await DB.prepare("UPDATE orders SET payment_ref=?1,status='submitted',updated_at=?2 WHERE id=?3").bind(ref, now(), r.id).run();
      return J({ ok: true });
    }


    /* ---------- live stats: read (public) ---------- */
    if (p === "leaderboard" && m === "GET") {
      const cat = url.searchParams.get("cat") || "kills", C = CATS[cat];
      if (!C) throw new Err("Unknown leaderboard");
      const meta = await statsMeta(DB);
      if (!meta.has_data || (C.online && meta.stale)) return J({ cat, unavailable: true, rows: [], total: 0, page: 1, pages: 1, meta }, 200, CACHE);
      const page = Math.max(1, parseInt(url.searchParams.get("page")) || 1), q = str(url.searchParams.get("q"), 16).replace(/[%_\\]/g, "");
      const where = [C.online ? "online=1" : `${C.col}>0`], bd = [];
      if (q) { where.push("name LIKE ?"); bd.push(`%${q}%`); }
      const W = where.join(" AND ");
      const pos = C.online ? "(SELECT COUNT(*)+1 FROM players b WHERE b.online=1 AND b.playtime>players.playtime)" : `(SELECT COUNT(*)+1 FROM players b WHERE b.${C.col}>players.${C.col})`;
      const total = (await DB.prepare(`SELECT COUNT(*) n FROM players WHERE ${W}`).bind(...bd).first()).n;
      const rows = (await DB.prepare(`SELECT *, ${pos} AS pos FROM players WHERE ${W} ORDER BY ${C.col} DESC, name COLLATE NOCASE LIMIT ? OFFSET ?`).bind(...bd, PAGE, (page - 1) * PAGE).all()).results.map(r => ({ ...pubP(r), pos: r.pos }));
      return J({ cat, page, pages: Math.max(1, Math.ceil(total / PAGE)), size: PAGE, total, rows, meta }, 200, CACHE);
    }
    if (p === "player" && m === "GET") {
      const name = str(url.searchParams.get("name"), 17), uu = normU(url.searchParams.get("uuid"));
      if (!name && !UU.test(uu)) throw new Err("Enter a player name");
      const P = c => `(SELECT COUNT(*)+1 FROM players b WHERE b.${c}>players.${c})`;
      const r = await DB.prepare(`SELECT *, ${["kills", "deaths", "playtime", "balance", "shards", "killstreak"].map(c => `${P(c)} AS p_${c}`).join(",")}, (SELECT COUNT(*)+1 FROM players b WHERE b.online=1 AND b.playtime>players.playtime) AS p_online FROM players WHERE ${name ? "lower(name)=lower(?)" : "uuid=?"} LIMIT 1`).bind(name || uu).first();
      if (!r) throw new Err("Player not found", 404);
      const meta = await statsMeta(DB), positions = {};
      for (const c of ["kills", "deaths", "playtime", "balance", "shards", "killstreak"]) positions[c] = r[c] > 0 ? r["p_" + c] : null;
      positions.online = r.online && !meta.stale ? r.p_online : null;
      return J({ ...pubP(r), online: !!r.online && !meta.stale, positions, meta }, 200, CACHE);
    }

    /* ---------- live stats: write (Minecraft server only, secret key) ---------- */
    if (p === "ingest" && m === "POST") {
      await statsAuth(req, env);
      const txt = await req.text(); if (txt.length > 200000) throw new Err("Request too large", 413);
      let b; try { b = JSON.parse(txt); } catch { throw new Err("Invalid JSON"); }
      const players = b.players === undefined ? [] : b.players;
      if (!Array.isArray(players) || players.length > 100) throw new Err("players must be an array of at most 100 entries");
      const t = now(), rows = players.map((x, i) => {
        const uuid = normU(x.uuid), name = str(x.name, 17);
        if (!UU.test(uuid)) throw new Err(`players[${i}].uuid is invalid`);
        if (!/^\.?[A-Za-z0-9_]{1,16}$/.test(name)) throw new Err(`players[${i}].name is invalid`);
        const f = k => { const v = pnum(x[k], k, i); return v === null ? null : Math.floor(v); }, bal = pnum(x.balance, "balance", i);
        return [uuid, name, str(x.rank, 32) || null, f("kills"), f("deaths"), f("playtime"), bal === null ? null : Math.round(bal * 100) / 100, f("shards"), f("killstreak"), t];
      });
      const st = [];
      for (let i = 0; i < rows.length; i += 9) {
        const ch = rows.slice(i, i + 9);
        st.push(DB.prepare(`INSERT INTO players(uuid,name,rank_name,kills,deaths,playtime,balance,shards,killstreak,updated) VALUES ${ch.map(() => "(?,?,?,?,?,?,?,?,?,?)").join(",")} ON CONFLICT(uuid) DO UPDATE SET name=excluded.name,rank_name=COALESCE(excluded.rank_name,players.rank_name),kills=COALESCE(excluded.kills,players.kills),deaths=COALESCE(excluded.deaths,players.deaths),playtime=COALESCE(excluded.playtime,players.playtime),balance=COALESCE(excluded.balance,players.balance),shards=COALESCE(excluded.shards,players.shards),killstreak=COALESCE(excluded.killstreak,players.killstreak),updated=excluded.updated`).bind(...ch.flat()));
      }
      if (b.online !== undefined) {
        if (!Array.isArray(b.online) || b.online.length > 270) throw new Err("online must be an array of at most 270 UUIDs");
        const on = b.online.map(normU); if (!on.every(u => UU.test(u))) throw new Err("online contains an invalid UUID");
        st.push(DB.prepare("UPDATE players SET online=0 WHERE online=1"));
        for (let i = 0; i < on.length; i += 90) { const ch = on.slice(i, i + 90); st.push(DB.prepare(`UPDATE players SET online=1,last_seen=? WHERE uuid IN (${ch.map(() => "?").join(",")})`).bind(t, ...ch)); }
        const oc = Number.isInteger(b.online_count) && b.online_count >= 0 ? b.online_count : on.length;
        st.push(DB.prepare("INSERT INTO meta(k,v) VALUES('online_count',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(oc)));
      }
      st.push(DB.prepare("INSERT INTO meta(k,v) VALUES('last_sync',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(t)));
      await DB.batch(st);
      return J({ ok: true, players: rows.length });
    }


    /* ---------- Discord login ---------- */
    const origin = env.SITE_URL ? String(env.SITE_URL).replace(/\/+$/, "") : url.origin, redirectUri = origin + "/api/auth/discord/callback";
    const discordOk = !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && secretOk(env));
    if (p === "auth/discord/login" && m === "GET") {
      if (!discordOk) return redirect("/account.html?error=not_configured");
      const state = rnd(24, "abcdef0123456789");
      const q = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: "code", redirect_uri: redirectUri, scope: "identify", state });
      return redirect("https://discord.com/oauth2/authorize?" + q, [cookie("mango_oauth", state + "." + await hmac(env.SESSION_SECRET, "s." + state), 600), ...(url.searchParams.get("next") === "admin" ? [cookie("mango_next", "admin", 600)] : [])]);
    }
    if (p === "auth/discord/callback" && m === "GET") {
      const toAdmin = getCookie(req, "mango_next") === "admin", home = toAdmin ? "/admin.html" : "/account.html";
      const fail = c => redirect(home + "?error=" + c, [cookie("mango_oauth", "", 0), cookie("mango_next", "", 0)]);
      if (!discordOk) return fail("not_configured");
      if (url.searchParams.get("error")) return fail("denied");
      const [st, sig] = getCookie(req, "mango_oauth").split("."), state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
      if (!st || !sig || !code || !safeEq(st, state) || !safeEq(sig, await hmac(env.SESSION_SECRET, "s." + st))) return fail("state");
      let me;
      try {
        const tr = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(8000), body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
        const tk = await tr.json(); if (!tr.ok || !tk.access_token) return fail("failed");
        const ur = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + tk.access_token }, signal: AbortSignal.timeout(8000) });
        me = await ur.json(); if (!ur.ok || !/^\d{5,25}$/.test(String(me.id || ""))) return fail("failed");
      } catch { return fail("failed"); }
      await DB.prepare("INSERT INTO users(discord_id,username,global_name,avatar,created_at,last_login) VALUES(?1,?2,?3,?4,?5,?5) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,global_name=excluded.global_name,avatar=excluded.avatar,last_login=excluded.last_login")
        .bind(String(me.id), str(me.username, 40), me.global_name ? str(me.global_name, 60) : null, me.avatar || null, now()).run();
      const pl = (now() + 30 * 86400) + "." + me.id;
      return redirect(home + "?login=1", [cookie("mango_oauth", "", 0), cookie("mango_next", "", 0), cookie("mango_user", pl + "." + await hmac(env.SESSION_SECRET, "u." + pl), 30 * 86400)]);
    }
    if (p === "auth/logout" && m === "POST") {
      if (req.headers.get("X-Requested-With") !== "mangosmp") throw new Err("Forbidden", 403);
      return J({ ok: true }, 200, { "Set-Cookie": cookie("mango_user", "", 0) });
    }
    if (p === "me" && m === "GET") {
      const id = await sessionUser(req, env); if (!id) return J({ user: null, discord_configured: discordOk });
      const u = await DB.prepare("SELECT * FROM users WHERE discord_id=?1").bind(id).first();
      if (!u) return J({ user: null, discord_configured: discordOk });
      return J({ user: userPub(u), minecraft: u.mc_uuid ? { uuid: u.mc_uuid, name: u.mc_name, verified: true } : null, discord_configured: true });
    }
    if (p.startsWith("me/")) {
      const id = await sessionUser(req, env); if (!id) throw new Err("Please log in with Discord first.", 401);
      if (m !== "GET" && req.headers.get("X-Requested-With") !== "mangosmp") throw new Err("Forbidden", 403);
      if (p === "me/orders" && m === "GET") {
        const rs = (await DB.prepare("SELECT * FROM orders WHERE discord_id=?1 ORDER BY id DESC LIMIT 50").bind(id).all()).results;
        return J({ orders: rs.map(r => { const o = orderPub(r); delete o.id; delete o.payment_info; return o; }) });
      }
      if (p === "me/link-code" && m === "POST") {
        const code = rnd(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
        await DB.prepare("DELETE FROM link_codes WHERE discord_id=?1 OR expires<?2").bind(id, now()).run();
        await DB.prepare("INSERT INTO link_codes(code,discord_id,expires) VALUES(?1,?2,?3)").bind(code, id, now() + 600).run();
        return J({ code, expires_in: 600 });
      }
      if (p === "me/unlink" && m === "POST") { await DB.prepare("UPDATE users SET mc_uuid=NULL,mc_name=NULL WHERE discord_id=?1").bind(id).run(); return J({ ok: true }); }
    }
    /* called by the Minecraft plugin when a player types /link CODE (proves they own the Minecraft account) */
    if (p === "link/confirm" && m === "POST") {
      await statsAuth(req, env);
      const b = await body(), code = str(b.code, 10).toUpperCase(), uuid = normU(b.uuid), name = str(b.name, 17);
      if (!/^[A-Z0-9]{6}$/.test(code) || !UU.test(uuid) || !/^\.?[A-Za-z0-9_]{1,16}$/.test(name)) throw new Err("Invalid link request");
      const lc = await DB.prepare("SELECT * FROM link_codes WHERE code=?1 AND expires>?2").bind(code, now()).first();
      if (!lc) throw new Err("That code is invalid or has expired. Generate a new one on the website.", 404);
      if (await DB.prepare("SELECT 1 x FROM users WHERE mc_uuid=?1 AND discord_id<>?2").bind(uuid, lc.discord_id).first()) throw new Err("That Minecraft account is already linked to another Discord account. Ask staff for help.", 409);
      await DB.batch([DB.prepare("UPDATE users SET mc_uuid=?1,mc_name=?2 WHERE discord_id=?3").bind(uuid, name, lc.discord_id), DB.prepare("DELETE FROM link_codes WHERE code=?1").bind(code)]);
      const u = await DB.prepare("SELECT username FROM users WHERE discord_id=?1").bind(lc.discord_id).first();
      return J({ ok: true, discord: u ? u.username : "" });
    }

    /* ---------- admin ---------- */
    const adminIds = String(env.ADMIN_DISCORD_IDS || "").split(/[,\s]+/).filter(x => /^\d{5,25}$/.test(x));
    if (p === "admin/options" && m === "GET") return J({ password: pwOk(env) && secretOk(env), discord: discordOk && adminIds.length > 0 });
    if (p === "admin/login" && m === "POST") {
      if (!env.ADMIN_PASSWORD || !secretOk(env)) throw new Err("Admin is not configured. Set ADMIN_PASSWORD and SESSION_SECRET (32+ characters).", 503);
      if (!pwOk(env)) throw new Err("ADMIN_PASSWORD is too short. Use at least 12 characters, then redeploy.", 503);
      const who = ip(req);
      if (req.headers.get("X-Requested-With") !== "mangosmp") throw new Err("Forbidden", 403);
      if (await limited(env, "login", who, 8, 900)) throw new Err("Too many failed attempts. Try again in 15 minutes.", 429);
      const b = await body();
      const ok = safeEq(await hmac(env.SESSION_SECRET, String(b.password ?? "")), await hmac(env.SESSION_SECRET, env.ADMIN_PASSWORD));
      if (!ok) { await hit(env, "login", who); throw new Err("Wrong password", 401); }
      await audit(DB, "password", "login", "");
      const exp = now() + 8 * 3600, pl = exp + "." + rnd(16, "abcdef0123456789");
      return J({ ok: true }, 200, { "Set-Cookie": `mango_admin=${pl}.${await hmac(env.SESSION_SECRET, pl)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` });
    }
    if (p.startsWith("admin/")) {
      const actor = await adminActor(req, env, DB);
      if (!actor) throw new Err("Unauthorized", 401);
      if (m !== "GET" && req.headers.get("X-Requested-With") !== "mangosmp") throw new Err("Forbidden", 403);
      const a = p.slice(6).split("/");
      if (a[0] === "me") return J({ ok: true, actor });
      if (a[0] === "logout" && m === "POST") return J({ ok: true }, 200, { "Set-Cookie": "mango_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" });

      if (a[0] === "audit" && m === "GET") return J({ entries: (await DB.prepare("SELECT ts,actor,action,detail FROM audit_log ORDER BY id DESC LIMIT 100").all()).results });
      if (a[0] === "export" && a[1] === "orders" && m === "GET") {
        const rs = (await DB.prepare("SELECT * FROM orders ORDER BY id DESC").all()).results;
        const cell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
        const rows = [["code", "created", "minecraft", "discord", "discord_id", "items", "total_pkr", "payment_method", "payment_reference", "status", "note"].join(",")];
        for (const r of rs) rows.push([r.code, new Date(r.created_at * 1000).toISOString(), r.mc_username, r.discord_username, r.discord_id, JSON.parse(r.items).map(i => `${i.qty}x ${i.name}`).join("; "), r.total, r.payment_method, r.payment_ref, r.status, r.note].map(cell).join(","));
        await audit(DB, actor, "orders.export", rs.length + " orders");
        return new Response(rows.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="mangosmp-orders.csv"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      }
      if (a[0] === "products") {
        if (m === "GET") return J({ products: (await DB.prepare("SELECT * FROM products ORDER BY sort,name").all()).results.map(pub) });
        if (m === "POST") {
          const c = cleanProduct(await body()); let id = slug(c.name);
          if (await DB.prepare("SELECT 1 x FROM products WHERE id=?1").bind(id).first()) id += "-" + rnd(4, "abcdefghjkmnpqrstuvwxyz23456789");
          await DB.prepare("INSERT INTO products(id,category,name,description,benefits,price,max_qty,icon,image,color,enabled,sort) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)")
            .bind(id, c.category, c.name, c.description, c.benefits, c.price, c.max_qty, c.icon, c.image, c.color, c.enabled, c.sort).run();
          await audit(DB, actor, "product.create", id + " " + c.name);
          return J({ id }, 201);
        }
        if (m === "PUT" && a[1]) {
          const c = cleanProduct(await body());
          const r = await DB.prepare("UPDATE products SET category=?2,name=?3,description=?4,benefits=?5,price=?6,max_qty=?7,icon=?8,image=?9,color=?10,enabled=?11,sort=?12 WHERE id=?1")
            .bind(a[1], c.category, c.name, c.description, c.benefits, c.price, c.max_qty, c.icon, c.image, c.color, c.enabled, c.sort).run();
          if (!r.meta.changes) throw new Err("Product not found", 404);
          await audit(DB, actor, "product.update", a[1] + " price=" + c.price + " enabled=" + c.enabled);
          return J({ ok: true });
        }
        if (m === "DELETE" && a[1]) { await DB.prepare("DELETE FROM products WHERE id=?1").bind(a[1]).run(); await audit(DB, actor, "product.delete", a[1]); return J({ ok: true }); }
      }
      if (a[0] === "image" && m === "POST") {
        const mime = (req.headers.get("content-type") || "").split(";")[0];
        if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) throw new Err("Only PNG, JPG, WEBP or GIF images are allowed");
        const u = new Uint8Array(await req.arrayBuffer());
        if (!u.length || u.length > 400 * 1024) throw new Err("Image must be smaller than 400 KB");
        let bin = ""; for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode(...u.subarray(i, i + 8192));
        const id = rnd(32, "0123456789abcdef");
        await DB.prepare("INSERT INTO images(id,mime,data) VALUES(?1,?2,?3)").bind(id, mime, btoa(bin)).run();
        await audit(DB, actor, "image.upload", id);
        return J({ url: "/api/image/" + id }, 201);
      }
      if (a[0] === "orders") {
        if (m === "GET") {
          const st = url.searchParams.get("status"), q = str(url.searchParams.get("q"), 40), w = [], bd = [];
          if (ST.includes(st)) { w.push("status=?"); bd.push(st); }
          if (q) { w.push("(code LIKE ? OR mc_username LIKE ? OR discord_username LIKE ?)"); bd.push(`%${q}%`, `%${q}%`, `%${q}%`); }
          const rs = await DB.prepare("SELECT * FROM orders" + (w.length ? " WHERE " + w.join(" AND ") : "") + " ORDER BY id DESC LIMIT 200").bind(...bd).all();
          return J({ orders: rs.results.map(orderPub) });
        }
        if (m === "PUT" && a[1]) {
          const b = await body(); if (!ST.includes(b.status)) throw new Err("Invalid status");
          const r = await DB.prepare("UPDATE orders SET status=?1,note=?2,updated_at=?3 WHERE id=?4").bind(b.status, str(b.note, 500), now(), Number(a[1])).run();
          if (!r.meta.changes) throw new Err("Order not found", 404);
          await audit(DB, actor, "order.status", a[1] + " -> " + b.status);
          return J({ ok: true });
        }
      }
      if (a[0] === "payments") {
        if (m === "GET") return J({ payments: (await DB.prepare("SELECT * FROM payment_methods ORDER BY sort,name").all()).results.map(payPub) });
        if (m === "POST") {
          const c = cleanPay(await body()), id = slug(c.name) + "-" + rnd(4, "abcdefghjkmnpqrstuvwxyz23456789");
          await DB.prepare("INSERT INTO payment_methods(id,name,instructions,enabled,sort) VALUES(?1,?2,?3,?4,?5)").bind(id, c.name, c.instructions, c.enabled, c.sort).run();
          await audit(DB, actor, "payment.create", id);
          return J({ id }, 201);
        }
        if (m === "PUT" && a[1]) {
          const c = cleanPay(await body());
          await DB.prepare("UPDATE payment_methods SET name=?2,instructions=?3,enabled=?4,sort=?5 WHERE id=?1").bind(a[1], c.name, c.instructions, c.enabled, c.sort).run();
          await audit(DB, actor, "payment.update", a[1]);
          return J({ ok: true });
        }
        if (m === "DELETE" && a[1]) { await DB.prepare("DELETE FROM payment_methods WHERE id=?1").bind(a[1]).run(); await audit(DB, actor, "payment.delete", a[1]); return J({ ok: true }); }
      }
    }
    throw new Err("Not found", 404);
  } catch (e) {
    if (e instanceof Err) return J({ error: e.message }, e.status);
    console.error(e);
    return J({ error: "Server error" }, 500);
  }
}
