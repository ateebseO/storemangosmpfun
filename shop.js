// Shared store helpers: formatting, API, pixel icons, cart.
(() => {
  const S = window.STORE;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => n == null ? "Price not set" : `${S.currency} ${Number(n).toLocaleString(S.locale)}`;

  async function api(path, opt = {}) {
    const o = { credentials: "same-origin", ...opt, headers: { "Content-Type": "application/json", "X-Requested-With": "mangosmp", ...(opt.headers || {}) } };
    if (o.body && typeof o.body !== "string" && !(o.body instanceof Blob)) o.body = JSON.stringify(o.body);
    let r; try { r = await fetch(S.api + path, o); } catch { throw new Error("Cannot reach the store server."); }
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || "The store backend is not connected yet (see README).");
    return d || {};
  }

  /* ---- pixel icons (12x12 maps) ---- */
  const HEADS = {
    ring: [".aaaa.", "abbbba", "ab..ba", "ab..ba", "ab..ba", "abbbba", ".aaaa."],
    cross: ["..aa..", "..bb..", "abbbba", "abccba", "abbbba", "..bb..", "..aa.."],
    block: ["aaaaaa", "abbbba", "abccba", "abccba", "abccba", "abbbba", "aaaaaa"],
    gem: ["..aa..", ".abba.", "abccba", "abccba", "abccba", ".abba.", "..aa.."],
    spike: ["a.aa.a", "abbbba", "abccba", "abccba", "abccba", "abbbba", "a.aa.a"]
  };
  function keyMap(head, teeth) {
    const g = Array.from({ length: 12 }, () => Array(12).fill("."));
    HEADS[head].forEach((row, r) => [...row].forEach((ch, c) => { g[r + 2][c] = ch; }));
    for (let c = 6; c < 12; c++) { g[4][c] = "a"; g[5][c] = "b"; g[6][c] = "a"; }
    teeth.forEach(c => { g[7][c] = "b"; g[8][c] = "a"; });
    return g.map(r => r.join(""));
  }
  const ICONS = {
    "rank-vip": { m: ["............", "....aaaa....", "...abbbba...", "..abbccbba..", ".abbccccbba.", ".abccccccba.", ".abccccccba.", "..abccccba..", "...abccba...", "....abba....", ".....aa.....", "............"], p: { a: "#1b7a38", b: "#55ff7a", c: "#c4ffd2" } },
    "rank-vipplus": { m: [".....aa.....", "....abba....", "...abccba...", "..abccccba..", ".abccddccba.", "abccddddccba", ".abccddccba.", "..abccccba..", "...abccba...", "....abba....", ".....aa.....", "............"], p: { a: "#0f6b86", b: "#55e1ff", c: "#a8f1ff", d: "#ffffff" } },
    "rank-mvp": { m: [".....aa.....", "....abba....", "....abba....", "aaaabbbbaaaa", "abbbbccbbbba", ".abbbccbbba.", "..abbccbba..", "..abbbbbba..", ".abbbaabbba.", ".aaa....aaa.", "............", "............"], p: { a: "#8a6200", b: "#ffc82c", c: "#fff0a8" } },
    "rank-mvpplus": { m: ["............", "............", "a....aa....a", "ba...bb...ab", "bba..bb..abb", "bbbabbbbabbb", "bbbbbbbbbbbb", "bcbbbddbbbcb", "bbbbbbbbbbbb", "aaaaaaaaaaaa", "............", "............"], p: { a: "#8c1f6a", b: "#ff55c8", c: "#ffd1f0", d: "#ffffff" } },
    "rank-mango": { m: [".......dd...", "......dddd..", ".....ddd....", "....aaaaaa..", "...abbbbbba.", "..abbccbbbba", "..abcbbbbbba", "..abbbbbbbba", "..abbbbbbbba", "...abbbbbba.", "....aaaaaa..", "............"], p: { a: "#b45f06", b: "#ffb300", c: "#fff1a8", d: "#3fb950" } },
    "key-common": { m: keyMap("ring", [8, 10]), p: { a: "#4a4f57", b: "#c9d0d8", c: "#ffffff" } },
    "key-prime": { m: keyMap("cross", [7, 9, 11]), p: { a: "#0f5a2a", b: "#3be07a", c: "#c4ffd9" } },
    "key-gold": { m: keyMap("block", [9, 11]), p: { a: "#7a5200", b: "#ffc82c", c: "#fff0a8" } },
    "key-amethyst": { m: keyMap("gem", [8, 11]), p: { a: "#3d1a6e", b: "#a05bff", c: "#e6d0ff" } },
    "key-crimson": { m: keyMap("spike", [7, 10]), p: { a: "#5a0b14", b: "#ff3b4e", c: "#ffc2c9" } }
  };
  const svg = (k, size) => {
    const i = ICONS[k] || ICONS["rank-vip"]; let r = "";
    i.m.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== "." && i.p[ch]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${i.p[ch]}"/>`; }));
    return `<svg viewBox="0 0 12 12" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  };
  const icon = (p, size = 96) => p.image ? `<img src="${esc(p.image)}" alt="" width="${size}" height="${size}" loading="lazy">` : svg(p.icon, size);

  const STATUS = {
    pending: ["Awaiting payment", "Your order is saved, but no payment has been received or verified yet. Follow the payment instructions below."],
    submitted: ["Payment under review", "You sent a payment reference. Staff will check it before marking the order as paid."],
    paid: ["Payment verified", "Staff verified your payment. Your items will be delivered in-game."],
    delivered: ["Delivered", "Your items were delivered. Contact support if anything is missing."],
    cancelled: ["Cancelled", "This order was cancelled."],
    refunded: ["Refunded", "This order was refunded."]
  };

  let cache;
  const load = async force => {
    if (cache && !force) return cache;
    const d = await api("/store");
    d.products.forEach(p => { p.available = !!p.enabled && p.price != null; });
    return (cache = d);
  };

  /* ---- cart (kept in this browser only) ---- */
  const KEY = "mango_cart";
  const cart = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || "[]").filter(i => i && typeof i.id === "string" && i.qty > 0); } catch { return []; } },
    set(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { } window.updateCartBadge && window.updateCartBadge(); },
    add(id, q, max) { const a = this.get(), i = a.find(x => x.id === id); if (i) i.qty = Math.min(max, i.qty + q); else a.push({ id, qty: Math.min(max, q) }); this.set(a); },
    setQty(id, q, max) { const a = this.get(), i = a.find(x => x.id === id); if (i) { i.qty = Math.max(1, Math.min(max, q)); this.set(a); } },
    remove(id) { this.set(this.get().filter(x => x.id !== id)); },
    clear() { this.set([]); },
    lines(prods) {
      const m = new Map(prods.map(p => [p.id, p]));
      return this.get().filter(i => m.has(i.id)).map(i => { const p = m.get(i.id), qty = Math.min(i.qty, p.max_qty); return { p, qty, sub: p.available ? p.price * qty : 0 }; });
    },
    total: l => l.reduce((a, x) => a + x.sub, 0)
  };

  document.addEventListener("click", e => { if (e.target.closest('a[aria-disabled="true"]')) e.preventDefault(); });
  window.Shop = { $, $$, esc, fmt, api, icon, ICONS, STATUS, load, cart };
})();
