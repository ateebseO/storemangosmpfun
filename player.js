// Player sign-in: Java / Bedrock / Guest. This identifies a player on this website only (saved in this browser).
// It does NOT verify account ownership with Microsoft/Mojang, and it never asks for a password.
(() => {
  const root = document.querySelector("[data-player]");
  const KEY = "mango_player", JAVA = /^[A-Za-z0-9_]{3,16}$/, BED = /^\.?[A-Za-z0-9_ ]{3,16}$/;
  const valid = (name, bedrock) => (bedrock ? BED : JAVA).test(String(name).trim());
  window.MangoPlayer = { valid };
  if (!root) return;
  const $ = s => root.querySelector(`[data-p="${s}"]`);
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const save = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { } window.updatePlayerChip && window.updatePlayerChip(); };
  let bedrock = false;

  const MAP = ["aaaaaaaa", "aaaaaaaa", "abbbbbba", "abcbbcba", "abbbbbba", "abbddbba", "abbbbbba", "bbbbbbbb"], PAL = { a: "#4a3b2a", b: "#c8946a", c: "#2b2b6b", d: "#8a5a3a" };
  const generic = size => { let r = ""; MAP.forEach((row, y) => [...row].forEach((ch, x) => { r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${PAL[ch]}"/>`; })); return `<svg viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Default avatar">${r}</svg>`; };
  function avatar(p, size) {
    const w = document.createElement("span"); w.className = "av"; w.innerHTML = generic(size);
    if (p.edition === "java" && p.found !== false) {
      const img = new Image(); img.width = img.height = size; img.alt = p.name + " Minecraft avatar";
      img.onload = () => w.replaceChildren(img);
      img.src = `https://mc-heads.net/avatar/${encodeURIComponent(p.uuid || p.name)}/${size * 2}`;
    }
    return w;
  }
  async function lookup(name) {
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 7000);
      const r = await fetch("https://playerdb.co/api/player/minecraft/" + encodeURIComponent(name), { signal: c.signal }); clearTimeout(t);
      const d = await r.json();
      if (d.success && d.data && d.data.player) return { found: true, name: d.data.player.username, uuid: d.data.player.id };
      return { found: false };
    } catch { return { found: null }; }
  }

  function show(p) {
    $("form").hidden = true; $("profile").hidden = false;
    const g = p.edition === "guest";
    $("pname").textContent = g ? "Guest" : p.name;
    $("pedition").textContent = g ? "Guest" : p.edition === "java" ? "Java" : "Bedrock";
    $("d-ed").textContent = g ? "Guest" : p.edition === "java" ? "Java Edition" : "Bedrock Edition";
    $("d-status").textContent = g ? "Browsing as a guest" : p.edition === "bedrock" ? "Profile details are only available for Java accounts" : p.found === true ? "Java profile found" : p.found === false ? "No Java profile found for this name" : "Profile lookup is unavailable right now";
    const u = $("uuid-row"); u.hidden = !p.uuid; $("d-uuid").textContent = p.uuid || "";
    const n = $("namemc"); n.hidden = !(p.edition === "java" && p.found === true); if (!n.hidden) n.href = "https://namemc.com/profile/" + encodeURIComponent(p.name);
    $("avatar").replaceChildren(avatar(p, 96));
    const st = $("stats"); st.hidden = g; if (!g) st.href = "profile.html?name=" + encodeURIComponent(p.name);
  }
  function showForm() { $("profile").hidden = true; $("form").hidden = false; $("err").textContent = ""; }
  function setBedrock(v) {
    bedrock = v;
    $("bed-yes").classList.toggle("on", v); $("bed-no").classList.toggle("on", !v);
    $("bed-yes").setAttribute("aria-checked", v); $("bed-no").setAttribute("aria-checked", !v);
    $("ulabel").textContent = v ? "Bedrock gamertag" : "Minecraft username (Java)";
    $("name").placeholder = v ? "YourGamertag" : "Steve";
    $("hint").textContent = v ? "Bedrock players: enter your gamertag. Profile lookups only work for Java accounts." : "Java usernames are 3 to 16 letters, numbers or underscores.";
  }
  $("bed-yes").onclick = () => setBedrock(true); $("bed-no").onclick = () => setBedrock(false);
  const go = async () => {
    const name = $("name").value.trim(), err = $("err"); err.textContent = "";
    if (!name) return err.textContent = "Please enter your Minecraft username.";
    if (!valid(name, bedrock)) return err.textContent = bedrock ? "Gamertags use 3 to 16 letters, numbers, spaces or underscores." : "Java usernames use 3 to 16 letters, numbers or underscores (no spaces).";
    const b = $("go"); b.disabled = true; b.textContent = "Checking…";
    let p;
    if (bedrock) p = { edition: "bedrock", name };
    else { const r = await lookup(name); p = { edition: "java", name: r.name || name, uuid: r.uuid || "", found: r.found }; }
    b.disabled = false; b.textContent = "Continue";
    save(p); show(p);
  };
  $("go").onclick = go;
  $("name").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  $("guest").onclick = () => { const p = { edition: "guest", name: "Guest" }; save(p); show(p); };
  $("out").onclick = () => { save(null); $("name").value = ""; showForm(); };
  const cur = get(); if (cur && cur.edition) show(cur);
})();
