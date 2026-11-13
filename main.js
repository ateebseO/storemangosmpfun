(() => {
  const C = window.MANGO, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const links0 = () => $$("[data-discord]").forEach(a => { a.href = C.discord; a.target = "_blank"; a.rel = "noopener"; });
  links0(); addEventListener("mango-links", links0);
  $$("[data-ip]").forEach(e => e.textContent = C.ip);

  const burger = $(".burger"), links = $(".links");
  burger?.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    burger.setAttribute("aria-expanded", open);
  });
  links?.addEventListener("click", e => { if (e.target.closest("a")) { links.classList.remove("open"); burger.setAttribute("aria-expanded", false); } });

  const toast = $(".toast");
  let tt;
  const say = window.say = msg => { toast.textContent = msg; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), 2200); };
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
    say("Copied " + text);
  }
  $$("[data-copy]").forEach(b => b.addEventListener("click", () => copy(C.ip)));

  const box = $$("[data-status]");
  async function status() {
    if (!box.length) return;
    try {
      const r = await fetch(C.statusApi + C.ip, { cache: "no-store" });
      const d = await r.json(), on = !!d.online;
      box.forEach(b => {
        b.classList.toggle("on", on); b.classList.toggle("off", !on);
        $("[data-state]", b).textContent = on ? "Online" : "Offline";
        $("[data-players]", b).textContent = on ? `${d.players?.online ?? 0} / ${d.players?.max ?? "?"} players` : "Server is offline";
      });
    } catch {
      box.forEach(b => { b.classList.remove("on"); b.classList.add("off"); $("[data-state]", b).textContent = "Unavailable"; $("[data-players]", b).textContent = "Status check failed"; });
    }
  }
  status(); setInterval(status, 60000);

  const dlg = $("#buy");
  if (dlg) {
    const ok = $("#accept"), go = $("#go");
    const sync = () => go.setAttribute("aria-disabled", !ok.checked);
    ok.addEventListener("change", sync);
    go.addEventListener("click", e => { if (!ok.checked) { e.preventDefault(); say("Please accept the policies first"); } });
    $$("[data-rank]").forEach(b => b.addEventListener("click", () => {
      $("#buy-rank").textContent = b.dataset.rank;
      $("#buy-price").textContent = b.dataset.price;
      ok.checked = false; sync();
      dlg.showModal();
    }));
    $("[data-close]", dlg).addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  }

  $$(".faq details").forEach(d => d.addEventListener("toggle", () => { if (d.open) $$(".faq details").forEach(o => o !== d && (o.open = false)); }));

  const cv = $("#scene");
  if (cv) {
    const x = cv.getContext("2d"), reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const P = 6; let W, H, mx = 0, t = 0, parts = [];
    const size = () => { W = Math.ceil(innerWidth / P); H = Math.ceil(cv.clientHeight / P); cv.width = W; cv.height = H; parts = Array.from({ length: 36 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * .08 + .02, c: Math.random() })); };
    const layers = [
      { c: "#171207", f: .5, y: .62, o: .15, k: 1 }, { c: "#241b06", f: .8, y: .72, o: .4, k: 2 }, { c: "#080704", f: 1.2, y: .84, o: .7, k: 3 }
    ];
    const h = (l, i) => Math.floor(H * l.y + Math.sin(i * .05 * l.f + l.o * 9) * H * .06 + Math.sin(i * .13 * l.f + l.o) * H * .025 + Math.sin(i * .31 * l.f) * 1.5);
    const bands = ["#050505", "#0a0803", "#120d03", "#1c1405", "#2c1e06", "#47300a", "#6b4a0c", "#9a6a10"];
    function draw() {
      bands.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, Math.floor(H * i / bands.length * .9), W, H); });
      const sx = Math.floor(W * .74 - mx * 3), sy = Math.floor(H * .42), r = Math.min(14, Math.floor(H * .16));
      [[r + 7, "rgba(255,200,44,.08)"], [r + 4, "rgba(255,200,44,.14)"], [r, "#ffc82c"]].forEach(([q, c]) => { x.fillStyle = c; x.fillRect(sx - q, sy - q, q * 2, q * 2); });
      x.fillStyle = "#ffe48a"; x.fillRect(sx - r, sy - r, r * 2, 2); x.fillStyle = "#ff9d00"; x.fillRect(sx - r, sy + r - 3, r * 2, 3);
      layers.forEach(l => {
        const off = Math.floor(t * l.k * .12 + mx * l.k * 4);
        for (let i = 0; i < W; i++) {
          const y = h(l, i + off);
          x.fillStyle = l.c; x.fillRect(i, y, 1, H - y);
          if (l.k !== 2) { x.fillStyle = l.k === 1 ? "#3a2a08" : "#c98f0a"; x.fillRect(i, y, 1, 1); }
        }
      });
      parts.forEach(p => { p.y -= p.s; if (p.y < 0) { p.y = H; p.x = Math.random() * W; } x.fillStyle = p.c > .5 ? "#ffc82c" : "#ff9d00"; x.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1); });
    }
    const loop = () => { t++; draw(); requestAnimationFrame(loop); };
    size(); addEventListener("resize", () => { size(); draw(); });
    addEventListener("pointermove", e => mx = (e.clientX / innerWidth - .5));
    reduce ? draw() : loop();
  }

  const cc = () => { let n = 0; try { n = JSON.parse(localStorage.getItem("mango_cart") || "[]").reduce((s, i) => s + (+i.qty || 0), 0); } catch { } $$("[data-cartcount]").forEach(e => { e.textContent = n; e.closest(".cartbtn").classList.toggle("has", n > 0); }); };
  window.updateCartBadge = cc; cc(); addEventListener("storage", cc);

  window.updatePlayerChip = () => {
    document.querySelectorAll(".pchip").forEach(e => e.remove());
    let p, d; try { p = JSON.parse(localStorage.getItem("mango_player")); } catch { } try { d = JSON.parse(localStorage.getItem("mango_discord")); } catch { }
    const ul = $(".links"), cart = ul && $(".cartbtn", ul); if (!(d && d.name) && !(p && p.edition) || !cart) return;
    const li = document.createElement("li"); li.className = "pchip";
    const a = document.createElement("a"); a.href = d && d.name ? "account.html" : "index.html#player"; a.title = d && d.name ? "Your account" : "Your player profile";
    const img = new Image(); img.alt = ""; img.width = img.height = 26; img.onload = () => a.prepend(img);
    if (d && d.name) { if (d.avatar) img.src = d.avatar; }
    else if (p.edition === "java" && p.found !== false) img.src = "https://mc-heads.net/avatar/" + encodeURIComponent(p.uuid || p.name) + "/52";
    const s = document.createElement("span"); s.textContent = d && d.name ? d.name : p.edition === "guest" ? "Guest" : p.name; a.append(s); li.append(a);
    ul.insertBefore(li, cart.closest("li"));
  };
  window.updatePlayerChip();
  try {
    if (localStorage.getItem("mango_discord") && !sessionStorage.getItem("mango_dchk")) {
      sessionStorage.setItem("mango_dchk", "1");
      fetch("/api/me").then(r => r.json()).then(x => { if (!x.user) { localStorage.removeItem("mango_discord"); window.updatePlayerChip(); } }).catch(() => { });
    }
  } catch { }
})();
