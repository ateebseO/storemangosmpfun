// Admin panel UI. All authorization happens on the server (signed HttpOnly session cookie).
(() => {
  const { $, $$, esc, fmt, api, icon, ICONS, STATUS } = window.Shop, root = $("#admin");
  if (!root) return;
  const say = m => window.say && window.say(m), dt = t => new Date(t * 1000).toLocaleString();
  let tab = "products";
  const a = async (p, o) => { try { return await api(p, o); } catch (x) { if (x.message === "Unauthorized") loginView(); throw x; } };
  const wrap = fn => async (...r) => { try { await fn(...r); } catch (x) { if (x.message !== "Unauthorized") say(x.message); } };

  const LOGIN_ERR = { not_configured: "Discord login is not configured.", denied: "You cancelled the Discord login.", state: "The login could not be verified. Please try again.", failed: "Discord could not complete the login. Please try again." };
  async function loginView(note) {
    let o = { password: true, discord: false }; try { o = await api("/admin/options"); } catch { }
    root.innerHTML = `<div class="card login"><h2>Admin login</h2><p class="muted">Authorized administrators only.</p>${note ? `<p class="err" role="alert">${esc(note)}</p>` : ""}
      ${o.password === false ? '<p class="err" role="alert">The admin password is not set up correctly (it must be at least 12 characters, with a SESSION_SECRET of 32+ characters). See the beginner guide.</p>' : ""}
      <form id="lf"><label>Password<input type="password" name="pw" autocomplete="current-password" required></label><p class="err" id="le" role="alert"></p><button class="btn block">Log in</button></form>
      ${o.discord ? '<div class="or"><span>or</span></div><a class="btn discord block" href="/api/auth/discord/login?next=admin">Login with Discord</a>' : ""}</div>`;
    $("#lf").onsubmit = async e => { e.preventDefault(); try { await api("/admin/login", { method: "POST", body: { password: e.target.pw.value } }); shell(); } catch (x) { $("#le").textContent = x.message; } };
  }
  async function start() {
    const qs = new URLSearchParams(location.search);
    try { await api("/admin/me"); shell(); }
    catch (x) { if (/Unauthorized/.test(x.message)) loginView(qs.get("login") ? "This Discord account is not an administrator." : qs.get("error") ? LOGIN_ERR[qs.get("error")] : ""); else loginView(x.message); }
  }
  const TABS = ["products", "orders", "payments", "activity", "setup"];
  function shell() {
    root.innerHTML = `<div class="adm-bar"><div class="tabs">${TABS.map(t => `<button data-t="${t}" class="${t === tab ? "on" : ""}">${t === "setup" ? "Setup check" : t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div><button class="btn ghost sm" id="lo">Log out</button></div><div id="pane"><p class="empty">Loading…</p></div>`;
    $$("[data-t]").forEach(b => b.onclick = () => { tab = b.dataset.t; shell(); });
    $("#lo").onclick = async () => { try { await api("/admin/logout", { method: "POST", body: {} }); await api("/auth/logout", { method: "POST", body: {} }); } catch { } loginView(); };
    ({ products, orders, payments, activity, setup })[tab]().catch(x => { if (x.message !== "Unauthorized") $("#pane").innerHTML = `<p class="empty">${esc(x.message)}</p>`; });
  }

  /* ---------- activity log ---------- */
  async function activity() {
    const L = (await a("/admin/audit")).entries;
    $("#pane").innerHTML = `<div class="adm-head"><h2>Activity</h2></div><p class="muted">The last 100 admin actions: who did what and when.</p>
      <div class="tw"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>${L.length ? L.map(e => `<tr><td>${dt(e.ts)}</td><td>${esc(e.actor)}</td><td>${esc(e.action)}</td><td>${esc(e.detail)}</td></tr>`).join("") : '<tr><td colspan="4">No activity yet.</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- setup check ---------- */
  async function setup() {
    const h = await api("/health"), C = h.checks;
    const ROWS = [
      ["database", "Database (Turso)", { ok: "Connected", not_configured: "Not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Netlify, then redeploy.", unreachable: "Cannot connect. Check the Turso URL and token." }],
      ["admin_password", "Admin password", { ok: "OK (12+ characters)", missing: "Missing. Add ADMIN_PASSWORD in Netlify.", too_short: "Too short. Use at least 12 characters." }],
      ["session_secret", "Session secret", { ok: "OK (32+ characters)", missing: "Missing. Add SESSION_SECRET in Netlify.", too_short: "Too short. Use at least 32 characters." }],
      ["stats_api_key", "Minecraft plugin key", { ok: "OK (24+ characters)", missing: "Missing. Add STATS_API_KEY in Netlify.", too_short: "Too short. Use at least 24 characters." }],
      ["discord_client_id", "Discord Client ID", { ok: "Set", missing: "Missing (needed for Discord login)" }],
      ["discord_client_secret", "Discord Client Secret", { ok: "Set", missing: "Missing (needed for Discord login)" }],
      ["site_url", "Site address (SITE_URL)", { ok: "Set", missing: "Missing (needed for Discord login)" }]];
    $("#pane").innerHTML = `<div class="adm-head"><h2>Setup check</h2><button class="btn ghost sm" id="rc">Check again</button></div>
      <p class="muted">Shows whether each setting is configured. Secret values are never displayed.</p>
      <div class="tw"><table><thead><tr><th>Setting</th><th>Status</th></tr></thead><tbody>${ROWS.map(([k, l, m]) => `<tr><td>${l}</td><td><span class="pill ${C[k] === "ok" ? "ok" : "no"}">${C[k] === "ok" ? "OK" : "Fix"}</span> ${esc(m[C[k]] || C[k])}</td></tr>`).join("")}
      <tr><td>Last stats sync from Minecraft</td><td>${h.last_stats_sync ? dt(h.last_stats_sync) : '<span class="pill wait">None yet</span> Install the plugin on your server (see the guide).'}</td></tr>
      <tr><td>Discord administrators</td><td>${h.admin_discord_ids} allow-listed (set ADMIN_DISCORD_IDS to add more)</td></tr></tbody></table></div>
      <p class="muted" style="margin-top:1rem">Discord redirect address to register in the Discord Developer Portal:</p><p class="instr">${esc(h.discord_redirect_uri)}</p>`;
    $("#rc").onclick = () => setup();
  }

  /* ---------- products ---------- */
  async function products() {
    const L = (await a("/admin/products")).products;
    $("#pane").innerHTML = `<div class="adm-head"><h2>Products</h2><button class="btn sm" id="np">Add product</button></div>
      <p class="muted">Products without a price show as unavailable in the store until you set one.</p>
      <div class="tw"><table><thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>
      ${L.map(p => `<tr><td class="ti">${icon(p, 36)}</td><td>${esc(p.name)}</td><td>${p.category}</td><td>${fmt(p.price)}</td>
      <td><label class="sw"><input type="checkbox" data-en="${esc(p.id)}" ${p.enabled ? "checked" : ""}> ${p.enabled ? "Enabled" : "Disabled"}</label></td>
      <td class="ta"><button class="btn ghost sm" data-ed="${esc(p.id)}">Edit</button> <button class="btn ghost sm del" data-del="${esc(p.id)}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
    $("#np").onclick = () => form(null);
    $$("[data-ed]").forEach(b => b.onclick = () => form(L.find(p => p.id === b.dataset.ed)));
    $$("[data-en]").forEach(c => c.onchange = wrap(async () => { const p = L.find(x => x.id === c.dataset.en); await a("/admin/products/" + p.id, { method: "PUT", body: { ...p, enabled: c.checked } }); say(c.checked ? "Enabled" : "Disabled"); products(); }));
    $$("[data-del]").forEach(b => b.onclick = wrap(async () => { const p = L.find(x => x.id === b.dataset.del); if (!confirm(`Delete "${p.name}" permanently? Existing orders keep their own copy.`)) return; await a("/admin/products/" + p.id, { method: "DELETE" }); say("Deleted"); products(); }));
  }
  function form(p) {
    const n = !p, d = p || { category: "ranks", name: "", description: "", benefits: [], price: null, max_qty: 10, icon: "rank-vip", image: "", color: "#ffc82c", enabled: 1, sort: 0 };
    let dlg = $("#pf"); if (dlg) dlg.remove();
    dlg = document.createElement("dialog"); dlg.id = "pf"; dlg.className = "wide";
    dlg.innerHTML = `<form id="pform"><div class="dhead"><h3>${n ? "Add product" : "Edit " + esc(d.name)}</h3><button type="button" class="x" data-x aria-label="Close">✕</button></div>
      <div class="fgrid"><label>Name<input name="name" value="${esc(d.name)}" maxlength="60" required></label>
      <label>Category<select name="category"><option value="ranks" ${d.category === "ranks" ? "selected" : ""}>Ranks</option><option value="keys" ${d.category === "keys" ? "selected" : ""}>Keys</option></select></label>
      <label>Price (PKR, whole number, empty = not set)<input name="price" type="number" min="1" step="1" value="${d.price ?? ""}"></label>
      <label>Max quantity per order<input name="max_qty" type="number" min="1" max="999" value="${d.max_qty}"></label>
      <label>Sort order<input name="sort" type="number" step="1" value="${d.sort}"></label>
      <label>Accent color<input name="color" type="color" value="${esc(d.color)}"></label>
      <label>Built-in icon<select name="icon">${Object.keys(ICONS).map(k => `<option ${k === d.icon ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label>Product image (PNG/JPG/WEBP/GIF, max 400 KB)<input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif"></label></div>
      <div class="imgrow"><span id="imgprev">${d.image ? icon(d, 56) : "No custom image (built-in icon is used)"}</span><button type="button" class="btn ghost sm" id="imgrm" ${d.image ? "" : "hidden"}>Remove image</button></div>
      <label>Description<textarea name="description" rows="3" maxlength="600">${esc(d.description)}</textarea></label>
      <label>Benefits (one per line)<textarea name="benefits" rows="5">${esc(d.benefits.join("\n"))}</textarea></label>
      <label class="sw"><input type="checkbox" name="enabled" ${d.enabled ? "checked" : ""}> Enabled (customers can buy it)</label>
      <p class="err" id="pe" role="alert"></p><div class="dlg-actions"><button class="btn">Save product</button><button type="button" class="btn ghost" data-x>Cancel</button></div></form>`;
    document.body.append(dlg); dlg.showModal();
    let image = d.image;
    dlg.onclick = e => { if (e.target === dlg || e.target.closest("[data-x]")) dlg.close(); };
    const f = $("#pform");
    f.file.onchange = async () => {
      const file = f.file.files[0]; if (!file) return;
      try { const r = await api("/admin/image", { method: "POST", headers: { "Content-Type": file.type }, body: file }); image = r.url; $("#imgprev").innerHTML = icon({ image }, 56); $("#imgrm").hidden = false; }
      catch (x) { $("#pe").textContent = x.message; f.file.value = ""; }
    };
    $("#imgrm").onclick = () => { image = ""; $("#imgprev").textContent = "No custom image (built-in icon is used)"; $("#imgrm").hidden = true; };
    f.onsubmit = async e => {
      e.preventDefault();
      const body = { name: f.elements.name.value, category: f.category.value, price: f.price.value === "" ? null : Number(f.price.value), max_qty: Number(f.max_qty.value), sort: Number(f.sort.value) || 0, color: f.color.value, icon: f.icon.value, image, description: f.description.value, benefits: f.benefits.value.split("\n"), enabled: f.enabled.checked };
      try { await a(n ? "/admin/products" : "/admin/products/" + d.id, { method: n ? "POST" : "PUT", body }); dlg.close(); say("Saved"); products(); }
      catch (x) { $("#pe").textContent = x.message; }
    };
  }

  /* ---------- orders ---------- */
  async function orders() {
    $("#pane").innerHTML = `<div class="adm-head"><h2>Orders</h2><button class="btn ghost sm" id="csv">Download CSV</button></div><div class="toolbar"><select id="of"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select><input id="oq" type="search" placeholder="Search code, Minecraft or Discord name"></div><div id="ol"></div>`;
    const load = wrap(async () => {
      const L = (await a(`/admin/orders?status=${$("#of").value}&q=${encodeURIComponent($("#oq").value)}`)).orders;
      $("#ol").innerHTML = L.length ? L.map(o => `<article class="card ord" data-id="${o.id}"><div class="ordtop"><b class="code">${esc(o.code)}</b><span class="muted">${dt(o.created_at)}</span></div>
        <p><b>${esc(o.mc_username)}</b>${o.discord_username ? " · Discord: " + esc(o.discord_username) : ""}</p>
        <p class="muted">${o.items.map(i => `${i.qty} × ${esc(i.name)}`).join(", ")}</p>
        <p>Total <b>${fmt(o.total)}</b> · ${esc(o.payment_method)}${o.payment_ref ? ` · Reference: <b>${esc(o.payment_ref)}</b>` : ""}</p>
        <div class="ordedit"><select data-st>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === o.status ? "selected" : ""}>${v[0]}</option>`).join("")}</select><input data-note placeholder="Note shown to the customer (optional)" maxlength="500" value="${esc(o.note)}"><button class="btn sm" data-save>Save</button></div></article>`).join("") : '<p class="empty">No orders found.</p>';
      $$("[data-save]").forEach(b => b.onclick = wrap(async () => { const c = b.closest(".ord"); await a("/admin/orders/" + c.dataset.id, { method: "PUT", body: { status: $("[data-st]", c).value, note: $("[data-note]", c).value } }); say("Order updated"); }));
    });
    $("#csv").onclick = wrap(async () => { const r = await fetch(window.STORE.api + "/admin/export/orders", { credentials: "same-origin" }); if (!r.ok) throw new Error("Export failed"); const u = URL.createObjectURL(await r.blob()), l = document.createElement("a"); l.href = u; l.download = "mangosmp-orders.csv"; l.click(); URL.revokeObjectURL(u); });
    $("#of").onchange = load; let t; $("#oq").oninput = () => { clearTimeout(t); t = setTimeout(load, 300); }; load();
  }

  /* ---------- payment methods ---------- */
  async function payments() {
    const L = (await a("/admin/payments")).payments;
    const row = m => `<form class="card pm" data-id="${esc(m?.id || "")}"><label>Name<input name="name" value="${esc(m?.name || "")}" maxlength="60" required></label>
      <label>Payment instructions shown to customers<textarea name="instructions" rows="4" maxlength="1500">${esc(m?.instructions || "")}</textarea></label>
      <div class="pmrow"><label>Sort<input name="sort" type="number" value="${m?.sort ?? 0}"></label><label class="sw"><input type="checkbox" name="enabled" ${(m ? m.enabled : 1) ? "checked" : ""}> Enabled</label>
      <button class="btn sm">${m ? "Save" : "Add method"}</button>${m ? '<button type="button" class="btn ghost sm del" data-del>Delete</button>' : ""}</div></form>`;
    $("#pane").innerHTML = `<div class="adm-head"><h2>Payment methods</h2></div><p class="muted">Write your real payment details (for example an account number) in the instructions. Never put API keys or passwords here: this text is public on the checkout page. Orders are only marked paid by an admin after verification.</p>${L.map(row).join("")}<h3 class="sub">Add a payment method</h3>${row(null)}`;
    $$(".pm").forEach(f => {
      f.onsubmit = wrap(async e => { e.preventDefault(); const id = f.dataset.id, body = { name: f.elements.name.value, instructions: f.instructions.value, sort: Number(f.sort.value) || 0, enabled: f.enabled.checked }; await a(id ? "/admin/payments/" + id : "/admin/payments", { method: id ? "PUT" : "POST", body }); say("Saved"); payments(); });
      const d = $("[data-del]", f); if (d) d.onclick = wrap(async () => { if (confirm("Delete this payment method?")) { await a("/admin/payments/" + f.dataset.id, { method: "DELETE" }); payments(); } });
    });
  }
  start();
})();
