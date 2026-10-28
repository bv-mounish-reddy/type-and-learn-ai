(() => {
  const $ = (s) => document.querySelector(s);
  const el = {
    setup: $("#setup"), game: $("#game"), thread: $("#thread"), composer: $("#composer"),
    input: $("#input"), best: $("#best"), go: $(".bar .go"),
    hud: $("#hud"), time: $("#time"), live: $("#live"), words: $("#words"),
    box: $("#box"), text: $("#text"), typer: $("#typer"), hint: $("#hint"),
    result: $("#result"), rWpm: $("#r-wpm"), rAcc: $("#r-acc"), rTime: $("#r-time"), rNote: $("#r-note"),
    retry: $("#retry"), again: $("#again"),
  };

  const PLACEHOLDER = {
    topic: "A topic, e.g. how attention works in transformers",
    raw: "Paste notes, definitions or facts you want to memorise",
  };

  let mode = "topic", duration = 60, busy = false, scores = {};
  let g = null; // current game

  /* ---------- setup: chat ---------- */

  function addMsg(kind, text, extra = "") {
    const d = document.createElement("div");
    d.className = `msg ${kind} ${extra}`.trim();
    d.textContent = text;
    el.thread.append(d);
    return d;
  }

  function resetThread() {
    el.thread.textContent = "";
    addMsg("bot", "What do you want to remember? Give me a topic, or paste raw notes, and I'll write a passage to type.");
  }

  function setPressed(attr, value) {
    document.querySelectorAll(`[data-${attr}]`).forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset[attr] === String(value))));
  }

  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode; setPressed("mode", mode);
    el.input.placeholder = PLACEHOLDER[mode]; el.input.focus();
  }));
  document.querySelectorAll("[data-duration]").forEach((b) => b.addEventListener("click", () => {
    duration = Number(b.dataset.duration); setPressed("duration", duration); renderBest();
  }));

  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.composer.requestSubmit(); }
  });

  el.composer.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = el.input.value.trim();
    if (!text || busy) return;
    busy = true; el.go.disabled = true;
    addMsg("user", text.length > 160 ? text.slice(0, 160) + "..." : text);
    const pending = addMsg("bot", "Writing your passage...", "pending");
    el.input.value = "";
    try {
      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text, duration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Try again.");
      startGame(data.passage, mode === "topic" ? text : "raw notes");
    } catch (err) {
      pending.textContent = err.message;
      pending.className = "msg bot error";
      el.input.value = text;
    } finally {
      busy = false; el.go.disabled = false;
    }
  });

  /* ---------- high scores ---------- */

  async function loadScores() {
    try { scores = await (await fetch("/api/scores")).json(); } catch { scores = {}; }
    renderBest();
  }

  function renderBest() {
    el.best.textContent = "";
    const list = scores[duration] || [];
    if (!list.length) return;
    const h = document.createElement("h2");
    h.textContent = `Best ${duration}s rounds`;
    const ol = document.createElement("ol");
    list.slice(0, 3).forEach((s) => {
      const li = document.createElement("li");
      for (const t of [`${Math.round(s.wpm)} wpm`, `${s.accuracy}%`, s.topic || ""]) {
        const sp = document.createElement("span"); sp.textContent = t; li.append(sp);
      }
      ol.append(li);
    });
    el.best.append(h, ol);
  }

  /* ---------- game ---------- */

  function startGame(passage, label) {
    clearInterval(g?.timer);
        g = { passage, label, duration, typed: "", keys: 0, good: 0, startedAt: 0, timer: null, over: false,
          words: [...passage.matchAll(/\S+/g)] };

    const frag = document.createDocumentFragment();
    for (const ch of passage) { const s = document.createElement("span"); s.textContent = ch; frag.append(s); }
    el.text.textContent = ""; el.text.append(frag);

    el.typer.disabled = false; el.typer.value = "";
    el.time.textContent = duration; el.live.textContent = "0 wpm";
    updateWordProgress();
    el.hud.hidden = false; el.hint.hidden = false; el.result.hidden = true;
    el.box.classList.remove("done"); el.box.scrollTop = 0;
    el.setup.hidden = true; el.game.hidden = false;
    paint(); el.typer.focus();
  }

  function paint() {
    const t = g.typed, kids = el.text.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].className = i < t.length ? (t[i] === g.passage[i] ? "ok" : "bad")
                        : (i === t.length && !g.over ? "cur" : "");
    }
    const cur = el.text.querySelector(".cur");
    if (cur) el.box.scrollTop = Math.max(0, cur.offsetTop - cur.offsetHeight);
  }

  function wpm(seconds) {
    if (seconds < 1) return 0;
    return completedWords(g.typed.length) / (seconds / 60);
  }

  function completedWords(typedLength) {
    return g.words.filter((word) => word.index + word[0].length <= typedLength).length;
  }

  function updateWordProgress() {
    el.words.textContent = `${completedWords(g.typed.length)} words typed`;
  }

  function tick() {
    const s = (performance.now() - g.startedAt) / 1000;
    const left = Math.max(0, g.duration - s);
    el.time.textContent = Math.ceil(left);
    el.live.textContent = `${Math.round(wpm(s))} wpm`;
    if (left <= 0) finish();
  }

  el.typer.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  el.typer.addEventListener("paste", (e) => e.preventDefault());
  el.box.addEventListener("click", () => g && !g.over && el.typer.focus());

  el.typer.addEventListener("input", () => {
    if (!g || g.over) return;
    const v = el.typer.value.slice(0, g.passage.length);
    el.typer.value = v;
    if (!g.startedAt) {
      g.startedAt = performance.now();
      g.timer = setInterval(tick, 100);
      el.hint.hidden = true;
    }
    for (let i = g.typed.length; i < v.length; i++) { g.keys++; if (v[i] === g.passage[i]) g.good++; }
    g.typed = v;
    updateWordProgress();
    paint();
    if (v.length === g.passage.length) finish();
  });

  async function finish() {
    if (g.over) return;
    g.over = true; clearInterval(g.timer);
    const secs = Math.min(g.duration, (performance.now() - g.startedAt) / 1000);
    const score = Math.round(wpm(Math.max(secs, 1)));
    const acc = g.keys ? (g.good / g.keys) * 100 : 100;

    el.typer.disabled = true; paint();
    el.hud.hidden = true; el.box.classList.add("done"); el.result.hidden = false;
    el.rWpm.textContent = score;
    el.rAcc.textContent = `${Math.round(acc)}%`;
    el.rTime.textContent = `${Math.round(secs)}s`;
    el.rNote.textContent = "";
    el.retry.focus();

    if (score > 0) {
      try {
        const res = await fetch("/api/scores", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duration: g.duration, wpm: score, accuracy: acc, topic: g.label }),
        });
        const d = await res.json();
        el.rNote.textContent = d.new_best ? `New best for ${g.duration}s rounds.`
                             : d.rank ? `Rank ${d.rank} for ${g.duration}s rounds.` : "";
        loadScores();
      } catch { /* scores are optional; ignore */ }
    }
  }

  function backToSetup() {
    clearInterval(g?.timer); g = null;
    el.game.hidden = true; el.setup.hidden = false;
    resetThread(); renderBest(); el.input.focus();
  }

  el.retry.addEventListener("click", () => startGame(g.passage, g.label));
  el.again.addEventListener("click", backToSetup);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && g) backToSetup(); });

  /* ---------- init ---------- */
  el.input.placeholder = PLACEHOLDER.topic;
  resetThread(); loadScores(); el.input.focus();
})();
