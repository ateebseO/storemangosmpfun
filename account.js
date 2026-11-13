// Account page: Discord login, verified Minecraft linking (/link CODE in game) and order history.
(() => {
  const root = document.querySelector("[data-acct]"); if (!root) return;
  const { api, esc, fmt, STATUS } = window.Shop, say = m => window.say && window.say(m), IP = (window.MANGO || {}).ip || "";
  const ERR = { not_configured: "Discord login is not set up on this website yet. The site owner needs to add the Discord keys in Netlify.", denied: "You cancelled the Discord login. You can try again any time.", state: "The login could not be verified (it may have expired). Please try again.", failed: "Discord could not complete the login. Please try again." };
  const qs = new URLSearchParams(location.search); let me = null, timer = null, tick = null;
  const setHint = u => { try { u ? localStorage.setItem("mango_discord", JSON.stringify({ id: u.id, name: u.name, avatar: u.avatar_url })) : localStorage.removeItem("mango_discord"); } catch { } window.updatePlayerChip && window.updatePlayerChip(); };
  const stop = () => { clearInterval(timer); clearInterval(tick); timer = tick = null; };
  const relink = () => window.dispatchEvent(new Event("mango-links"));
  const note = (kind, text) => `<div class="lbnote${kind === "ok" ? " okn" : ""}" role="alert">${esc(text)}</div>`;

  function loggedOut() {
    const err = qs.get("error");
    root.innerHTML = `<div class="card plcard acct">${err ? note("err", ERR[err] || ERR.failed) : ""}
      <h2 class="pl-h">Login with Discord</h2>
      <p class="muted">Log in with your Discord account to link your Minecraft account (verified in game), track your store orders and speed up checkout.</p>
      <a class="btn discord" href="/api/auth/discord/login">Login with Discord</a>
      <ul class="ticks"><li>We only read your Discord <b>username and avatar</b>.</li><li>We never see your password, messages or servers.</li><li>You can log out at any time.</li></ul>
      <p class="muted small">${me && me.discord_configured === false ? "Discord login is not configured yet. " : ""}Prefer not to use Discord? You can still use the <a href="index.html#player" style="color:var(--y)">quick player sign-in</a> and guest checkout.</p></div>`;
  }

  function mcCard() {
    const m = me.minecraft;
    if (m) return `<div class="card plcard acct"><h3 class="pl-h" style="font-size:1.3rem">Minecraft account</h3>
      <div class="prof"><div class="pav"><span class="av"><img src="https://mc-heads.net/avatar/${esc(m.uuid)}/96" alt=""></span></div><div class="pinfo"><h3>${esc(m.name)}</h3><span class="pill ok">Verified in game</span></div></div>
      <div class="pl-actions"><a class="btn" href="profile.html?name=${encodeURIComponent(m.name)}">My stats</a><a class="btn ghost" href="store.html">Visit the store</a><button class="btn ghost del" data-unlink>Unlink</button></div></div>`;
    return `<div class="card plcard acct"><h3 class="pl-h" style="font-size:1.3rem">Link your Minecraft account</h3>
      <p class="muted">Prove you own your Minecraft account by typing a short code in game. It takes about 30 seconds.</p>
      <div data-linkbox><button class="btn" data-getcode>Get my link code</button></div></div>`;
  }

  function loggedIn() {
    const u = me.user;
    root.innerHTML = `${qs.get("login") ? note("ok", "You are logged in with Discord.") : ""}
      <div class="card plcard acct"><div class="prof"><div class="pav"><span class="av"><img src="${esc(u.avatar_url)}" alt=""></span></div><div class="pinfo"><h3>${esc(u.name)}</h3><span class="pill wait">Discord · @${esc(u.username)}</span></div></div>
      <div class="pl-actions"><button class="btn ghost" data-logout>Log out</button></div></div>
      <div data-mc>${mcCard()}</div>
      <div class="card plcard acct"><h3 class="pl-h" style="font-size:1.3rem">My orders</h3><div data-orders><p class="muted">Loading…</p></div></div>`;
    api("/me/orders").then(d => {
      $o().innerHTML = d.orders.length ? d.orders.map(o => `<a class="orow" href="order.html?code=${encodeURIComponent(o.code)}" style="text-decoration:none;color:inherit"><span><b class="code" style="font-size:1rem;display:inline">${esc(o.code)}</b><br><small class="muted">${o.items.map(i => i.qty + " × " + esc(i.name)).join(", ")}</small></span><span style="text-align:right"><b>${fmt(o.total)}</b><br><span class="pill ${o.status === "delivered" || o.status === "paid" ? "ok" : o.status === "cancelled" || o.status === "refunded" ? "no" : "wait"}">${esc((STATUS[o.status] || [o.status])[0])}</span></span></a>`).join("") : '<p class="muted">No orders yet.</p><a class="btn sm" href="store.html">Visit the store</a>';
    }).catch(() => { $o().innerHTML = '<p class="muted">Orders are temporarily unavailable.</p>'; });
  }
  const $o = () => root.querySelector("[data-orders]");

  async function refresh() { me = await api("/me"); setHint(me.user); me.user ? loggedIn() : loggedOut(); relink(); }

  root.addEventListener("click", async e => {
    const t = e.target;
    try {
      if (t.closest("[data-logout]")) { stop(); await api("/auth/logout", { method: "POST", body: {} }); setHint(null); history.replaceState(null, "", "account.html"); me = { user: null }; loggedOut(); }
      else if (t.closest("[data-getcode]")) {
        const d = await api("/me/link-code", { method: "POST", body: {} }), box = root.querySelector("[data-linkbox]"); let left = d.expires_in;
        box.innerHTML = `<div class="codebox"><small>YOUR LINK CODE</small><b class="code-big">${esc(d.code)}</b><span class="muted small" data-left></span></div>
          <ol class="steps2"><li>Join <b>${esc(IP)}</b> in Minecraft.</li><li>Type <b>/link ${esc(d.code)}</b> in chat.</li><li>This page will update by itself.</li></ol>`;
        stop(); const upd = () => { const el = box.querySelector("[data-left]"); if (el) el.textContent = left > 0 ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Code expired. Get a new one."; };
        upd(); tick = setInterval(() => { left--; upd(); if (left <= 0) { stop(); box.insertAdjacentHTML("beforeend", '<button class="btn" data-getcode>Get a new code</button>'); } }, 1000);
        timer = setInterval(async () => { try { const x = await api("/me"); if (x.minecraft) { stop(); me = x; root.querySelector("[data-mc]").innerHTML = mcCard(); say("Minecraft account linked!"); } } catch { } }, 4000);
      }
      else if (t.closest("[data-unlink]")) { if (confirm("Unlink your Minecraft account?")) { await api("/me/unlink", { method: "POST", body: {} }); me.minecraft = null; root.querySelector("[data-mc]").innerHTML = mcCard(); } }
    } catch (x) { say(x.message); }
  });
  refresh().catch(() => { root.innerHTML = `<div class="lb-state"><h3>Account temporarily unavailable</h3><p>Could not reach the server. Please try again in a moment.</p><button class="btn" onclick="location.reload()">Try again</button></div>`; });
})();
