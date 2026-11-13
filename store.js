// Store pages: catalog + cart drawer, checkout, order tracking.
(() => {
  const { $, $$, esc, fmt, api, icon, STATUS, load, cart } = window.Shop, say = m => window.say && window.say(m);
  const badge = p => p.available ? '<span class="pill ok">Available</span>' : `<span class="pill no">${p.enabled ? "Price not set" : "Unavailable"}</span>`;
  const MC = /^\.?[A-Za-z0-9_]{3,16}$/;
  const supportBtn = '<a class="btn discord sm" data-discord href="#" target="_blank" rel="noopener">Discord support</a>';
  const fail = (el, e) => { el.innerHTML = `<div class="empty"><p>${esc(e.message)}</p>${supportBtn}</div>`; window.dispatchEvent(new Event("mango-links")); };

  /* ================= CATALOG ================= */
  const cat = $("#catalog");
  if (cat) {
    const grid = $("#grid"), count = $("#count"), dlg = $("#detail"), drawer = $("#drawer");
    let data = { products: [], payments: [] }, tab = location.hash === "#keys" ? "keys" : "ranks", q = "", sort = "featured";
    const by = { featured: (a, b) => a.sort - b.sort, low: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity), high: (a, b) => (b.price ?? -1) - (a.price ?? -1), name: (a, b) => a.name.localeCompare(b.name) };

    const card = p => `<article class="card prod${p.available ? "" : " off"}" style="--rc:${esc(p.color)}" data-icon="${esc(p.icon)}">
      <div class="pic">${icon(p)}</div>
      <div class="pbody"><div class="ptop"><h3>${esc(p.name)}</h3>${badge(p)}</div><p>${esc(p.description)}</p><div class="price">${fmt(p.price)}</div></div>
      <div class="pact"><button class="btn ghost sm" data-view="${esc(p.id)}">Details</button>
      <button class="btn sm" data-add="${esc(p.id)}" ${p.available ? "" : "disabled"}>${p.available ? "Add to cart" : "Unavailable"}</button></div></article>`;

    const render = () => {
      const list = data.products.filter(p => p.category === tab && (p.name + " " + p.description).toLowerCase().includes(q)).sort(by[sort]);
      count.textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
      grid.innerHTML = list.length ? list.map(card).join("") : '<p class="empty">No products match your search.</p>';
      $$("[data-tab]").forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    };

    /* cart drawer */
    const lineHtml = ({ p, qty, sub }) => `<div class="line" style="--rc:${esc(p.color)}"><div class="mini">${icon(p, 44)}</div>
      <div class="linfo"><b>${esc(p.name)}</b><small>${p.available ? fmt(p.price) + " each" : "Unavailable - not charged"}</small>
      <div class="qty"><button data-dec="${esc(p.id)}" aria-label="Decrease quantity">−</button><span>${qty}</span><button data-inc="${esc(p.id)}" aria-label="Increase quantity">+</button></div></div>
      <div class="lsub">${p.available ? fmt(sub) : "—"}<button class="rm" data-rm="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">✕</button></div></div>`;
    const drawerRender = () => {
      const lines = cart.lines(data.products);
      $("#cart-items").innerHTML = lines.length ? lines.map(lineHtml).join("") : '<p class="empty">Your cart is empty.</p>';
      $("#cart-total").textContent = fmt(cart.total(lines));
      $("#cart-go").setAttribute("aria-disabled", !lines.some(l => l.p.available));
    };
    const openCart = () => { drawerRender(); drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); document.body.classList.add("lock"); $("#cart-close").focus(); };
    const closeCart = () => { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); document.body.classList.remove("lock"); };
    drawer.addEventListener("click", e => {
      const t = e.target, id = t.dataset.inc || t.dataset.dec || t.dataset.rm, p = data.products.find(x => x.id === id);
      if (t === drawer || t.closest("#cart-close") || t.closest("#cart-more")) return closeCart();
      if (!p) return;
      const cur = cart.get().find(x => x.id === id)?.qty || 1;
      if (t.dataset.inc) cart.setQty(id, cur + 1, p.max_qty); else if (t.dataset.dec) cart.setQty(id, cur - 1, p.max_qty); else cart.remove(id);
      drawerRender();
    });
    $$("[data-cart]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); openCart(); }));
    addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("open")) closeCart(); });

    /* details popup */
    const detail = p => {
      let n = 1;
      dlg.innerHTML = `<div class="dhead" style="--rc:${esc(p.color)}"><div class="big">${icon(p, 110)}</div><div><h3>${esc(p.name)}</h3>${badge(p)}<div class="price">${fmt(p.price)}</div></div><button class="x" data-x aria-label="Close">✕</button></div>
        <p>${esc(p.description)}</p><h4>Benefits</h4>
        ${p.benefits.length ? `<ul class="ticks">${p.benefits.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : '<p class="muted">The benefits for this product have not been published yet. Ask in our Discord for details.</p>'}
        <div class="dbuy">${p.max_qty > 1 ? `<div class="qty"><button data-d="-1" aria-label="Decrease quantity">−</button><span id="dq">1</span><button data-d="1" aria-label="Increase quantity">+</button></div>` : '<span class="muted">Limit 1 per order</span>'}
        <button class="btn" data-addd ${p.available ? "" : "disabled"}>${p.available ? "Add to cart" : "Unavailable"}</button></div>
        <p class="note">Items are delivered in-game after staff verify your payment. See our <a href="refund.html">Refund Policy</a> and <a href="terms.html">Terms</a>.</p>`;
      dlg.onclick = e => {
        const t = e.target;
        if (t === dlg || t.closest("[data-x]")) dlg.close();
        else if (t.dataset.d) { n = Math.max(1, Math.min(p.max_qty, n + +t.dataset.d)); $("#dq").textContent = n; }
        else if (t.closest("[data-addd]")) { cart.add(p.id, n, p.max_qty); dlg.close(); say(`${n} × ${p.name} added to cart`); }
      };
      dlg.showModal();
    };

    grid.addEventListener("click", e => {
      const v = e.target.closest("[data-view]"), a = e.target.closest("[data-add]");
      if (v) detail(data.products.find(p => p.id === v.dataset.view));
      if (a) { const p = data.products.find(x => x.id === a.dataset.add); cart.add(p.id, 1, p.max_qty); say(`${p.name} added to cart`); }
    });
    $$("[data-tab]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; history.replaceState(null, "", "#" + tab); render(); }));
    $("#search").addEventListener("input", e => { q = e.target.value.trim().toLowerCase(); render(); });
    $("#sort").addEventListener("change", e => { sort = e.target.value; render(); });

    addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h === "cart") openCart(); else if (h === "ranks" || h === "keys") { tab = h; render(); } });
    load().then(d => { data = d; render(); if (location.hash === "#cart") openCart(); }).catch(e => fail(grid, e));
  }

  /* ================= CHECKOUT ================= */
  const co = $("#checkout");
  if (co) {
    const form = $("#co-form"), msg = $("#co-msg"), btn = $("#co-btn");
    const bad = m => { msg.textContent = m; msg.focus && msg.focus(); };
    load().then(data => {
      const lines = cart.lines(data.products), ok = lines.filter(l => l.p.available);
      if (!ok.length) { co.innerHTML = `<div class="empty"><p>Your cart is empty or has no available products.</p><a class="btn" href="store.html">Back to the store</a></div>`; return; }
      $("#co-items").innerHTML = lines.map(({ p, qty, sub }) => `<div class="line sm" style="--rc:${esc(p.color)}"><div class="mini">${icon(p, 36)}</div><div class="linfo"><b>${esc(p.name)}</b><small>${qty} × ${fmt(p.price)}${p.available ? "" : " (unavailable, not charged)"}</small></div><div class="lsub">${p.available ? fmt(sub) : "—"}</div></div>`).join("");
      const total = cart.total(lines); $("#co-total").textContent = fmt(total);
      const pays = data.payments;
      $("#co-pay").innerHTML = pays.length ? pays.map((m, i) => `<label class="radio"><input type="radio" name="pay" value="${esc(m.id)}" ${i === 0 ? "checked" : ""}><span><b>${esc(m.name)}</b></span></label>`).join("") : '<p class="muted">No payment method is configured yet. Please contact support on Discord.</p>';
      const showPay = () => { const m = pays.find(x => x.id === (form.querySelector("input[name=pay]:checked") || {}).value); $("#co-instr").textContent = m ? m.instructions : ""; };
      form.addEventListener("change", showPay); showPay();
      try { const pl = JSON.parse(localStorage.getItem("mango_player") || "null"); if (pl && pl.edition !== "guest" && MC.test(pl.name || "") && !form.mc.value) form.mc.value = pl.name; } catch { }
      api("/me").then(d => { if (!d.user) return; if (!form.dc.value) form.dc.value = d.user.username; if (d.minecraft && !form.mc.value) form.mc.value = d.minecraft.name; const w = $("#co-who"); if (w) w.textContent = "Logged in with Discord as " + d.user.name + (d.minecraft ? ", verified Minecraft account: " + d.minecraft.name : "") + "."; }).catch(() => { });
      btn.disabled = !pays.length;
      form.addEventListener("submit", async e => {
        e.preventDefault(); bad("");
        const mc = form.mc.value.trim(), pm = form.querySelector("input[name=pay]:checked");
        if (!MC.test(mc)) return bad("Enter a valid Minecraft username (3-16 letters, numbers or underscores).");
        if (!pm) return bad("Choose a payment method.");
        if (!form.agree.checked) return bad("Please accept the policies to continue.");
        btn.disabled = true; btn.textContent = "Placing order…";
        try {
          const r = await api("/orders", { method: "POST", body: { mc, discord: form.dc.value.trim(), payment: pm.value, agree: true, items: ok.map(l => ({ id: l.p.id, qty: l.qty })) } });
          try { localStorage.setItem("mango_last", JSON.stringify({ code: r.code, mc })); } catch { }
          cart.clear(); location.href = "order.html?code=" + encodeURIComponent(r.code);
        } catch (x) { bad(x.message); btn.disabled = false; btn.textContent = "Place order"; }
      });
    }).catch(e => fail(co, e));
  }

  /* ================= ORDER ================= */
  const od = $("#order");
  if (od) {
    const out = $("#order-out"), lf = $("#lookup");
    let cur = null, timer;
    const steps = ["pending", "submitted", "paid", "delivered"], dt = t => new Date(t * 1000).toLocaleString();
    const show = o => {
      cur = o; const [title, text] = STATUS[o.status] || [o.status, ""], at = steps.indexOf(o.status);
      const canRef = ["pending", "submitted"].includes(o.status);
      out.innerHTML = `<div class="card ohead"><div><small>Order code</small><b class="code">${esc(o.code)}</b></div><button class="btn ghost sm" id="cc">Copy code</button></div>
      <div class="card st ${esc(o.status)}"><span class="pill ${o.status === "delivered" || o.status === "paid" ? "ok" : o.status === "cancelled" || o.status === "refunded" ? "no" : "wait"}">${esc(title)}</span><p>${esc(text)}</p>
        ${at >= 0 ? `<ol class="prog">${steps.map((s, i) => `<li class="${i <= at ? "done" : ""}">${esc(STATUS[s][0])}</li>`).join("")}</ol>` : ""}
        ${o.note ? `<p class="staffnote"><b>Note from staff:</b> ${esc(o.note)}</p>` : ""}</div>
      <div class="card"><h3>Items</h3>${o.items.map(i => `<div class="orow"><span>${i.qty} × ${esc(i.name)}</span><b>${fmt(i.price * i.qty)}</b></div>`).join("")}<div class="orow tot"><span>Total</span><b>${fmt(o.total)}</b></div>
        <p class="muted">Minecraft: <b>${esc(o.mc_username)}</b>${o.discord_username ? " · Discord: " + esc(o.discord_username) : ""} · Placed ${dt(o.created_at)}</p></div>
      <div class="card"><h3>Payment: ${esc(o.payment_method)}</h3><p class="instr">${esc(o.payment_info)}</p>
        ${o.payment_ref ? `<p class="muted">Payment reference you sent: <b>${esc(o.payment_ref)}</b></p>` : ""}
        ${canRef ? `<form id="rf" class="inline"><input name="ref" placeholder="Payment reference / transaction ID" maxlength="80" required><button class="btn sm">Send reference</button></form><p class="err" id="re" role="alert"></p><p class="muted">Sending a reference does not complete your order. Staff must verify the payment first.</p>` : ""}</div>
      <div class="card"><h3>Need help?</h3><p class="muted">Open a ticket on Discord and include your order code.</p>${supportBtn}</div>`;
      window.dispatchEvent(new Event("mango-links"));
      $("#cc").onclick = () => { navigator.clipboard && navigator.clipboard.writeText(o.code); say("Copied " + o.code); };
      const rf = $("#rf");
      if (rf) rf.onsubmit = async e => {
        e.preventDefault();
        try { await api("/orders/reference", { method: "POST", body: { code: o.code, mc: o.mc_username, ref: rf.ref.value } }); say("Reference sent"); lookup(o.code, o.mc_username); }
        catch (x) { $("#re").textContent = x.message; }
      };
    };
    const lookup = async (code, mc, quiet) => {
      try {
        const o = await api(`/orders/lookup?code=${encodeURIComponent(code)}&mc=${encodeURIComponent(mc)}`);
        lf.hidden = true; show(o); clearInterval(timer); timer = setInterval(() => lookup(code, mc, true), 60000);
      } catch (x) { if (!quiet) { lf.hidden = false; $("#le").textContent = x.message; } }
    };
    lf.addEventListener("submit", e => { e.preventDefault(); const code = lf.code.value.trim().toUpperCase(), mc = lf.mc.value.trim(); try { localStorage.setItem("mango_last", JSON.stringify({ code, mc })); } catch { } lookup(code, mc); });
    const qc = (new URLSearchParams(location.search).get("code") || "").toUpperCase();
    let last = {}; try { last = JSON.parse(localStorage.getItem("mango_last") || "{}"); } catch { }
    if (qc) lf.code.value = qc;
    if (qc && last.code === qc && last.mc) lookup(qc, last.mc); else { if (last.mc) lf.mc.value = last.mc; if (qc) lookup(qc, "", true); }
  }
})();
