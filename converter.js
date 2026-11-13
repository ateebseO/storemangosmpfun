// Currency converter: PKR <-> USD using live exchange rates (free API, no key).
(() => {
  const SRC = ["https://open.er-api.com/v6/latest/USD", "https://latest.currency-api.pages.dev/v1/currencies/usd.json"];
  const KEY = "mango_fx", MAX_AGE = 7 * 864e5, REFRESH = 30 * 60e3;
  const nf = (n, d) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pkr = n => "Rs " + nf(n, 2);
  const usd = n => "$" + nf(n, n > 0 && n < 0.01 ? 6 : 2);

  function parse(s) {
    const t = String(s).replace(/[,\s]/g, "");
    if (t === "") return { err: "empty" };
    if (/^-/.test(t)) return { err: "The amount cannot be negative." };
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { err: "Enter numbers only, for example 1500 or 12.50." };
    const n = Number(t);
    if (!isFinite(n) || n > 1e12) return { err: "That amount is too large." };
    if (n <= 0) return { err: "Enter an amount greater than 0." };
    return { n };
  }
  const convert = (n, dir, rate) => dir === "pkr-usd" ? n / rate : n * rate;
  window.MangoFX = { parse, convert, pkr, usd };

  async function fetchRate() {
    for (const u of SRC) {
      try {
        const c = new AbortController(), to = setTimeout(() => c.abort(), 8000);
        const r = await fetch(u, { signal: c.signal, cache: "no-store" }); clearTimeout(to);
        if (!r.ok) continue;
        const d = await r.json(); let v, t, dateOnly = false;
        if (d.result === "success" && d.rates && d.rates.PKR) { v = +d.rates.PKR; t = (+d.time_last_update_unix || 0) * 1000 || Date.now(); }
        else if (d.usd && d.usd.pkr) { v = +d.usd.pkr; t = Date.parse(d.date) || Date.now(); dateOnly = true; }
        if (v > 0 && isFinite(v)) return { v, t, at: Date.now(), dateOnly };
      } catch { }
    }
    throw new Error("unavailable");
  }

  const roots = [...document.querySelectorAll("[data-cvroot]")];
  if (!roots.length) return;
  let fx = null, status = "loading", loading = false;
  const inst = roots.map(root => ({ root, dir: "pkr-usd", touched: false, last: "" }));
  const say = m => window.say && window.say(m);
  const STATUS = { loading: ["Updating…", "wait"], live: ["Live rate", "ok"], saved: ["Saved rate", "wait"], down: ["Rates unavailable", "no"] };
  const when = fx => fx.dateOnly ? new Date(fx.t).toLocaleDateString([], { dateStyle: "medium" }) : new Date(fx.t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

  function render(I) {
    const { root } = I, $ = s => root.querySelector(`[data-cv="${s}"]`);
    const A = I.dir === "pkr-usd", from = A ? "PKR" : "USD", to = A ? "USD" : "PKR";
    root.querySelectorAll("[data-dir]").forEach(b => { const on = b.dataset.dir === I.dir; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $("prefix").textContent = A ? "Rs" : "$"; $("code-from").textContent = from; $("code-to").textContent = to;
    $("from-label").textContent = A ? "Pakistani Rupees" : "US Dollars"; $("to-label").textContent = A ? "US Dollars" : "Pakistani Rupees";
    $("chips").innerHTML = (A ? [500, 1000, 5000, 10000] : [1, 5, 10, 25]).map(n => `<button type="button" class="chip" data-chip="${n}">${A ? "Rs " : "$"}${n.toLocaleString("en-US")}</button>`).join("");
    const [sl, sc] = STATUS[status]; const st = $("status"); st.textContent = sl; st.className = "pill " + sc;
    if (fx) {
      $("rate1").textContent = `1 USD = Rs ${nf(fx.v, fx.v >= 100 ? 2 : 4)}`; $("rate2").textContent = `1 PKR = $${(1 / fx.v).toFixed(6)}`;
      $("updated").textContent = when(fx);
      $("checked").textContent = status === "live" ? "Checked just now" : status === "saved" ? "Could not refresh. Showing the last saved rate." : "";
    } else { $("rate1").textContent = "—"; $("rate2").textContent = ""; $("updated").textContent = "—"; $("checked").textContent = status === "down" ? "Live rates could not be loaded." : "Loading the latest rate…"; }

    const inp = $("amount"), p = parse(inp.value); let err = "", out = "—", eq = "Enter an amount to see the conversion", ok = false;
    if (p.err === "empty") { if (I.touched) err = "Please enter an amount to convert."; }
    else if (p.err) err = p.err;
    else if (!fx) err = status === "loading" ? "" : "Live exchange rates are unavailable right now. Press Refresh to try again.";
    else { const v = convert(p.n, I.dir, fx.v); out = to === "USD" ? usd(v) : pkr(v); eq = `${A ? pkr(p.n) : usd(p.n)} = ${out}`; ok = true; }
    inp.setAttribute("aria-invalid", !!err && p.err !== undefined); root.querySelector(".cv-in").classList.toggle("bad", !!err && p.err !== "empty" && !!p.err || (p.err === "empty" && !!err));
    $("err").textContent = err; $("eq").textContent = eq; $("copy").disabled = !ok; I.eq = ok ? eq : "";
    const o = $("out"); if (o.textContent !== out) { o.textContent = out; o.classList.remove("pop"); void o.offsetWidth; o.classList.add("pop"); }
  }
  const all = () => inst.forEach(render);

  async function load(manual) {
    if (loading) return; loading = true; status = fx ? status : "loading";
    inst.forEach(I => { const b = I.root.querySelector('[data-cv="refresh"]'); b.disabled = true; b.classList.add("spin"); }); all();
    try { fx = await fetchRate(); status = "live"; try { localStorage.setItem(KEY, JSON.stringify(fx)); } catch { } if (manual) say("Exchange rate updated"); }
    catch {
      if (!fx) { try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && c.v > 0 && Date.now() - c.at < MAX_AGE) fx = c; } catch { } }
      status = fx ? "saved" : "down"; if (manual) say("Could not refresh the exchange rate");
    }
    loading = false; inst.forEach(I => { const b = I.root.querySelector('[data-cv="refresh"]'); b.disabled = false; b.classList.remove("spin"); }); all();
  }

  inst.forEach(I => {
    const { root } = I, $ = s => root.querySelector(`[data-cv="${s}"]`), inp = $("amount");
    inp.addEventListener("input", () => render(I));
    inp.addEventListener("blur", () => { I.touched = true; render(I); });
    root.querySelectorAll("[data-dir]").forEach(b => b.addEventListener("click", () => { I.dir = b.dataset.dir; render(I); }));
    $("swap").addEventListener("click", () => {
      I.dir = I.dir === "pkr-usd" ? "usd-pkr" : "pkr-usd"; root.classList.remove("swapping"); void root.offsetWidth; root.classList.add("swapping");
      $("swap").classList.toggle("on"); render(I);
    });
    $("clear").addEventListener("click", () => { inp.value = ""; I.touched = false; render(I); inp.focus(); });
    $("refresh").addEventListener("click", () => load(true));
    $("chips").addEventListener("click", e => { const c = e.target.closest("[data-chip]"); if (c) { inp.value = c.dataset.chip; I.touched = false; render(I); } });
    $("copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(I.eq); } catch { const t = document.createElement("textarea"); t.value = I.eq; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
      say("Copied " + I.eq);
    });
  });
  try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && c.v > 0 && Date.now() - c.at < MAX_AGE) { fx = c; status = "saved"; } } catch { }
  all(); load(false); setInterval(() => load(false), REFRESH);
})();
