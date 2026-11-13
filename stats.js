// Leaderboards + player profiles. All numbers come from /api/leaderboard and /api/player (real synced data only).
(() => {
  const S = window.STORE, Sh = window.Shop; if (!Sh) return;
  const { esc, api } = Sh, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const nf = n => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const int = n => n == null ? "—" : Math.round(n).toLocaleString("en-US");
  const bal = n => n == null ? "—" : (S.balanceSymbol || "$") + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const dur = s => { if (s == null) return "—"; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`; };
  const ago = t => { const s = Math.max(0, Math.floor(Date.now() / 1000) - t); return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
  const kd = r => r.kills == null || r.deaths == null ? null : r.deaths === 0 ? r.kills : r.kills / r.deaths;
  const MAP = ["aaaaaaaa", "aaaaaaaa", "abbbbbba", "abcbbcba", "abbbbbba", "abbddbba", "abbbbbba", "bbbbbbbb"], PAL = { a: "#4a3b2a", b: "#c8946a", c: "#2b2b6b", d: "#8a5a3a" };
  let GEN = ""; MAP.forEach((row, y) => [...row].forEach((ch, x) => { GEN += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${PAL[ch]}"/>`; }));
  const avatar = (uuid, size = 48) => `<span class="av"><svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${GEN}</svg><img src="https://mc-heads.net/avatar/${esc(uuid)}/${size * 2}" alt="" loading="lazy"></span>`;
  document.addEventListener("error", e => { if (e.target.tagName === "IMG" && e.target.closest(".av")) e.target.remove(); }, true);
  const unavailable = (msg, retry) => `<div class="lb-state"><h3>Data temporarily unavailable</h3><p>${esc(msg)}</p><div class="pl-actions" style="justify-content:center"><button class="btn" data-retry>Try again</button><a class="btn discord" data-discord href="#">Discord</a></div></div>`;
  const relink = () => window.dispatchEvent(new Event("mango-links"));

  /* ================= LEADERBOARDS ================= */
  const root = $("[data-lbroot]");
  if (root) {
    const L = k => $(`[data-lb="${k}"]`, root);
    const CAT = {
      kills: { unit: "Kills", v: r => int(r.kills), x: r => { const k = kd(r); return k == null ? "" : `K/D ${nf(k)}`; } },
      deaths: { unit: "Deaths", v: r => int(r.deaths), x: r => r.kills == null ? "" : `${int(r.kills)} kills` },
      playtime: { unit: "Playtime", v: r => dur(r.playtime), x: () => "" },
      balance: { unit: "Balance", v: r => bal(r.balance), x: () => "" },
      shards: { unit: "Shards", v: r => int(r.shards), x: () => "" },
      online: { unit: "Playtime", v: r => dur(r.playtime), x: () => "Online now" },
      killstreak: { unit: "Killstreak", v: r => int(r.killstreak), x: () => "" }
    };
    const qs = new URLSearchParams(location.search);
    let cat = CAT[qs.get("cat")] ? qs.get("cat") : "kills", page = Math.max(1, parseInt(qs.get("page")) || 1), q = (qs.get("q") || "").slice(0, 16), token = 0;
    L("q").value = q;
    const medal = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 15l-2.5 7L12 19l6.5 3L16 15" fill="currentColor" opacity=".6"/><circle cx="12" cy="9.5" r="7.5" fill="currentColor"/><path d="M12 5.2l1.4 2.9 3.2.4-2.3 2.2.6 3.2-2.9-1.5-2.9 1.5.6-3.2-2.3-2.2 3.2-.4z" fill="#111"/></svg>';
    const row = (r, i) => {
      const C = CAT[cat], sub = [r.rank, C.x(r)].filter(Boolean).join(" · ");
      return `<a class="lbrow${r.pos <= 3 ? " t" + r.pos : ""}" style="--i:${i}" href="profile.html?name=${encodeURIComponent(r.name)}" role="listitem"><span class="pos">${r.pos <= 3 ? medal : ""}<b>#${r.pos}</b></span>${avatar(r.uuid)}<span class="who"><b>${esc(r.name)}${r.online ? '<i class="dot-on" title="Online now"></i>' : ""}</b><small>${esc(sub)}</small></span><span class="val"><b>${esc(C.v(r))}</b><small>${C.unit}</small></span></a>`;
    };
    const pager = d => {
      const el = L("pager"); if (d.pages <= 1) { el.innerHTML = ""; return; }
      const set = new Set([1, d.pages, d.page - 1, d.page, d.page + 1].filter(n => n >= 1 && n <= d.pages)), nums = [...set].sort((a, b) => a - b);
      let h = `<button class="pg" data-pg="${d.page - 1}" ${d.page <= 1 ? "disabled" : ""} aria-label="Previous page">‹</button>`, last = 0;
      nums.forEach(n => { if (n - last > 1) h += '<span class="gap">…</span>'; h += `<button class="pg${n === d.page ? " on" : ""}" data-pg="${n}" ${n === d.page ? 'aria-current="page"' : ""}>${n}</button>`; last = n; });
      el.innerHTML = h + `<button class="pg" data-pg="${d.page + 1}" ${d.page >= d.pages ? "disabled" : ""} aria-label="Next page">›</button>`;
    };
    const render = d => {
      const m = d.meta || {};
      L("online").textContent = m.has_data && !m.stale && m.online_count != null ? m.online_count : "—";
      L("updated").textContent = m.has_data ? ago(m.last_sync) : "Never";
      const notice = L("notice"); notice.hidden = !(m.has_data && m.stale);
      if (!notice.hidden) notice.textContent = `Live updates are paused. These are the last stats received from the server (${ago(m.last_sync)}).`;
      L("pager").innerHTML = ""; L("count").textContent = "";
      if (d.unavailable) { L("list").innerHTML = unavailable(m.has_data ? "Online player data is not being updated right now." : "The server has not sent any stats yet. Leaderboards appear as soon as it does."); relink(); return; }
      if (!d.rows.length) { L("list").innerHTML = `<div class="lb-state"><p>${q ? `No player found matching “${esc(q)}”.` : "No players on this leaderboard yet."}</p></div>`; return; }
      L("list").innerHTML = d.rows.map(row).join("");
      const a = (d.page - 1) * d.size + 1; L("count").textContent = `Showing ${a}–${a + d.rows.length - 1} of ${d.total.toLocaleString("en-US")}`;
      pager(d);
    };
    async function load() {
      const my = ++token;
      $$("[data-cat]", root).forEach(b => { const on = b.dataset.cat === cat; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
      L("list").innerHTML = '<div class="lb-skel"></div>'.repeat(6);
      history.replaceState(null, "", `?cat=${cat}${q ? "&q=" + encodeURIComponent(q) : ""}${page > 1 ? "&page=" + page : ""}`);
      try { const d = await api(`/leaderboard?cat=${cat}&page=${page}&q=${encodeURIComponent(q)}`); if (my === token) render(d); }
      catch (e) { if (my === token) { L("count").textContent = ""; L("pager").innerHTML = ""; L("list").innerHTML = unavailable("Could not load the leaderboard. Please try again in a moment."); relink(); } }
    }
    root.addEventListener("click", e => {
      const c = e.target.closest("[data-cat]"), g = e.target.closest("[data-pg]"), r = e.target.closest("[data-retry]");
      if (c) { cat = c.dataset.cat; page = 1; load(); } else if (g && !g.disabled) { page = +g.dataset.pg; load(); window.scrollTo({ top: root.offsetTop - 80, behavior: "smooth" }); } else if (r) load();
    });
    let t; L("q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim().slice(0, 16); page = 1; load(); }, 300); });
    $("[data-clear]", root).addEventListener("click", () => { L("q").value = ""; q = ""; page = 1; load(); });
    setInterval(() => { if (document.visibilityState === "visible") api(`/leaderboard?cat=${cat}&page=${page}&q=${encodeURIComponent(q)}`).then(d => { render(d); }).catch(() => { }); }, 60000);
    load();
  }

  /* ================= PLAYER PROFILE ================= */
  const pf = $("[data-pfroot]");
  if (pf) {
    const name = (new URLSearchParams(location.search).get("name") || "").trim().slice(0, 17);
    const form = `<form class="inline" id="pfsearch"><input name="n" placeholder="Search a player name" maxlength="17" required aria-label="Player name"><button class="btn sm">View profile</button></form>`;
    const go = () => { const f = $("#pfsearch"); if (f) f.onsubmit = e => { e.preventDefault(); location.href = "profile.html?name=" + encodeURIComponent(f.n.value.trim()); }; };
    if (!name) { pf.innerHTML = `<div class="card plcard"><h2 class="pl-h">Find a player</h2><p class="muted">Search for any player who has joined MangoSMP, or open a profile from the leaderboards.</p>${form}<a class="btn ghost" href="leaderboards.html">Open leaderboards</a></div>`; go(); }
    else api("/player?name=" + encodeURIComponent(name)).then(p => {
      const m = p.meta || {}, k = kd(p), POS = [["kills", "Top Kills"], ["deaths", "Top Deaths"], ["playtime", "Top Playtime"], ["balance", "Top Balance"], ["shards", "Top Shards"], ["killstreak", "Top Killstreaks"], ["online", "Top Online Players"]];
      document.title = p.name + " | MangoSMP";
      const stat = (l, v) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`;
      pf.innerHTML = `<div class="card pfcard"><div class="pfhead"><div class="pav lg">${avatar(p.uuid, 112)}</div><div class="pinfo"><h2>${esc(p.name)}</h2><div class="badges">${p.rank ? `<span class="pill wait">${esc(p.rank)}</span>` : ""}${p.online ? '<span class="pill ok">Online now</span>' : ""}</div><p class="muted small">${p.rank ? "" : "Rank not reported. "}Stats updated ${m.has_data ? ago(m.last_sync) : "never"}${m.stale ? " (live updates paused)" : ""}</p></div></div>
        <div class="stat-grid">${stat("Kills", int(p.kills))}${stat("Deaths", int(p.deaths))}${stat("K/D", k == null ? "—" : nf(k))}${stat("Playtime", dur(p.playtime))}${stat("Balance", bal(p.balance))}${stat("Shards", int(p.shards))}${stat("Killstreak", int(p.killstreak))}</div>
        <h3 class="sub">Leaderboard positions</h3><div class="pos-list">${POS.map(([c, l]) => { const v = p.positions[c]; return `<a class="posrow${v && v <= 3 ? " t" + v : ""}" href="leaderboards.html?cat=${c}&q=${encodeURIComponent(p.name)}"><span>${l}</span><b>${v ? "#" + v.toLocaleString("en-US") : "Unranked"}</b></a>`; }).join("")}</div>
        <div class="pl-actions"><a class="btn" href="leaderboards.html">All leaderboards</a><a class="btn ghost" href="store.html">Visit the store</a></div></div>`;
    }).catch(e => {
      pf.innerHTML = /not found/i.test(e.message) ? `<div class="card plcard"><h2 class="pl-h">Player not found</h2><p class="muted">No synced stats for “${esc(name)}”. Check the spelling, or the player may not have joined since stats syncing began.</p>${form}<a class="btn ghost" href="leaderboards.html">Open leaderboards</a></div>` : unavailable("Could not load this profile right now.");
      go(); relink(); const r = $("[data-retry]", pf); if (r) r.onclick = () => location.reload();
    });
  }
})();
