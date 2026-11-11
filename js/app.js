(() => {
  "use strict";

  const POLL_MS = 15000;
  const GREEN = "#3dff9a";
  const TEAL = "#22d3c5";
  const RED = "#c87777";
  const MUTED = "rgba(138,160,160,0.7)";
  const INK = "#e8f6f0";
  const GRID = "rgba(34,211,197,0.16)";

  const el = (id) => document.getElementById(id);

  const nf = (opts) => new Intl.NumberFormat("nb-NO", opts);
  const nfFiat = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfFiat0 = nf({ minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const nfPrice = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfBtc = nf({ minimumFractionDigits: 4, maximumFractionDigits: 8 });
  const nfPct = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const nfSigned = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });

  function fmtMoney(n, ccy) {
    if (n == null || Number.isNaN(n)) return "—";
    return `${nfFiat.format(n)} ${ccy || ""}`.trim();
  }
  function fmtPrice(n, ccy) {
    if (n == null || Number.isNaN(n)) return "—";
    return `${nfPrice.format(n)}${ccy ? " " + ccy : ""}`;
  }
  function fmtBtc(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return nfBtc.format(n);
  }

  const animState = new Map();
  function animateTo(node, key, target, render, ms = 420) {
    if (target == null || Number.isNaN(target)) {
      node.textContent = "—";
      return;
    }
    const prev = animState.get(key);
    const from = prev && typeof prev.value === "number" ? prev.value : target;
    if (prev && prev.raf) cancelAnimationFrame(prev.raf);
    if (from === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animState.set(key, { value: target });
      node.textContent = render(target);
      return;
    }
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = from + (target - from) * e;
      node.textContent = render(v);
      if (t < 1) {
        const raf = requestAnimationFrame(tick);
        animState.set(key, { value: v, raf });
      } else {
        animState.set(key, { value: target });
        node.textContent = render(target);
      }
    };
    animState.set(key, { value: from, raf: requestAnimationFrame(tick) });
  }

  function setPnlClass(node, n) {
    node.classList.remove("up", "down");
    if (n > 0) node.classList.add("up");
    else if (n < 0) node.classList.add("down");
  }

  function parseOslo(ts) {
    if (!ts) return null;
    if (typeof ts === "number") return new Date(ts * (ts < 1e12 ? 1000 : 1));
    // "2026-11-11 22:01:17 CET"
    const m = String(ts).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
    if (m) return new Date(`${m[1]}T${m[2]}+01:00`);
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fmtTime(ts, withDate = false) {
    const d = parseOslo(ts);
    if (!d) return ts || "—";
    const t = new Intl.DateTimeFormat("nb-NO", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      ...(withDate ? { day: "numeric", month: "short" } : {}),
    }).format(d);
    return t;
  }

  function resizeCanvas(canvas, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 448;
    const h = cssH || canvas.clientHeight || 180;
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  function drawLineChart(canvas, points, opts = {}) {
    const height = opts.height || 180;
    const { ctx, w, h } = resizeCanvas(canvas, height);
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length < 1) {
      ctx.fillStyle = MUTED;
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText("Venter på prisdata…", 8, h / 2);
      return;
    }
    const pad = { l: 8, r: 52, t: 12, b: 22 };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanY = maxY - minY || Math.max(Math.abs(maxY) * 0.002, 1);
    const y0 = minY - spanY * 0.08;
    const y1 = maxY + spanY * 0.08;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const spanX = maxX - minX || 1;
    const X = (x) => pad.l + ((x - minX) / spanX) * (w - pad.l - pad.r);
    const Y = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (h - pad.t - pad.b);

    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (let i = 0; i < 4; i++) {
      const gy = pad.t + ((h - pad.t - pad.b) * i) / 3;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(w - pad.r, gy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const color = opts.color || TEAL;
    if (points.length >= 2) {
      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.moveTo(X(points[0].x), Y(points[0].y));
      for (let i = 1; i < points.length; i++) ctx.lineTo(X(points[i].x), Y(points[i].y));
      ctx.lineTo(X(last.x), h - pad.b);
      ctx.lineTo(X(points[0].x), h - pad.b);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
      grad.addColorStop(0, opts.fill || "rgba(34,211,197,0.16)");
      grad.addColorStop(1, "rgba(34,211,197,0)");
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(X(points[0].x), Y(points[0].y));
      for (let i = 1; i < points.length; i++) ctx.lineTo(X(points[i].x), Y(points[i].y));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(X(last.x), Y(last.y), 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(X(points[0].x), Y(points[0].y), 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.fillStyle = MUTED;
    ctx.font = "10px Geist Mono, ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(nfPrice.format(y1), w - 6, pad.t);
    ctx.fillText(nfPrice.format(y0), w - 6, h - pad.b);
    if (opts.lastLabel != null) {
      ctx.fillStyle = INK;
      ctx.fillText(nfPrice.format(opts.lastLabel), w - 6, Y(opts.lastLabel));
    }
  }

  function drawGrid(canvas, grid, price) {
    const { ctx, w, h } = resizeCanvas(canvas, 210);
    ctx.clearRect(0, 0, w, h);
    if (!grid || !grid.levels || !grid.levels.length) {
      ctx.fillStyle = MUTED;
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText("Grid vises når boten er klar", 8, h / 2);
      return;
    }
    const levels = grid.levels;
    const prices = levels.map((l) => l.price);
    if (price != null) prices.push(price);
    if (grid.stop_price) prices.push(grid.stop_price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const span = maxP - minP || 1;
    const pad = { l: 86, r: 14, t: 10, b: 10 };
    const Y = (p) => pad.t + (1 - (p - minP) / span) * (h - pad.t - pad.b);

    if (grid.stop_price) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(200,119,119,0.45)";
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(grid.stop_price));
      ctx.lineTo(w - pad.r, Y(grid.stop_price));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = RED;
      ctx.font = "9px Geist Mono, ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("stopp", pad.l + 4, Y(grid.stop_price) - 2);
    }

    levels.forEach((lv) => {
      const y = Y(lv.price);
      const open = !!lv.open;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.strokeStyle = open
        ? lv.side === "sell"
          ? "rgba(200,119,119,0.45)"
          : "rgba(61,255,154,0.45)"
        : "rgba(34,211,197,0.12)";
      ctx.lineWidth = open ? 1.25 : 1;
      ctx.stroke();

      ctx.font = "10px Geist Mono, ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = open ? INK : MUTED;
      ctx.fillText(nfPrice.format(lv.price), pad.l - 8, y);

      if (lv.side) {
        ctx.textAlign = "left";
        const tag = (lv.side === "buy" ? "kjøp" : "salg") + (open ? "" : "");
        ctx.fillStyle = lv.side === "buy" ? GREEN : RED;
        ctx.globalAlpha = open ? 1 : 0.4;
        ctx.fillText(tag, pad.l + 6, y);
        ctx.globalAlpha = 1;
      }
    });

    if (price != null) {
      const y = Y(price);
      ctx.strokeStyle = TEAL;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = TEAL;
      ctx.font = "10px Geist Mono, ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      // last price already on left axis if close; draw a small end cap
      ctx.textAlign = "left";
      const label = "nå " + nfPrice.format(price);
      const tw = ctx.measureText(label).width;
      const lx = Math.min(w - pad.r - tw - 6, w - pad.r - tw);
      ctx.fillText(label, w - pad.r - tw, y - 8);
    }
  }

  function renderTrades(fills, ccy) {
    const box = el("trades");
    if (!fills || !fills.length) {
      box.className = "trades empty";
      box.textContent = "Ingen handler ennå";
      return;
    }
    box.className = "trades";
    box.replaceChildren();
    fills.slice(0, 20).forEach((f) => {
      const row = document.createElement("div");
      row.className = "trade";
      const t = document.createElement("span");
      t.className = "time";
      t.textContent = fmtTime(f.time);
      const s = document.createElement("span");
      s.className = "side " + f.side;
      s.textContent = f.side === "buy" ? "kjøp" : "salg";
      const px = document.createElement("span");
      px.className = "px";
      px.textContent = `${fmtPrice(f.price)} · ${fmtBtc(f.size)}`;
      const fee = document.createElement("span");
      fee.className = "fee";
      fee.textContent = f.fee ? nfFiat.format(f.fee) : "";
      row.append(t, s, px, fee);
      box.append(row);
    });
  }

  function renderMeta(live, ticker) {
    const dl = el("meta-list");
    dl.replaceChildren();
    const rows = [];
    const cb = live.circuit_breaker || {};
    const ccy = live.currency || "EUR";
    rows.push(["Bot", live.running ? "Kjører" : live.status === "waiting" ? "Venter" : "Stoppet"]);
    rows.push(["Kretssperre", cb.triggered ? (cb.reason || "Utløst") : "Ikke utløst"]);
    if (live.cap != null) rows.push(["Tak", fmtMoney(live.cap, ccy)]);
    if (live.loss_stop != null) rows.push(["Tap-stopp", fmtMoney(live.loss_stop, ccy)]);
    if (cb.stop_price != null) rows.push(["Pris-stopp", fmtPrice(cb.stop_price, ccy)]);
    if (live.committed != null) rows.push(["Bundet i kjøp", fmtMoney(live.committed, ccy)]);
    if (cb.account_loss != null) rows.push(["Konto-tap", fmtMoney(cb.account_loss, ccy)]);
    if (live.peak_equity != null) rows.push(["Topp", fmtMoney(live.peak_equity, ccy)]);
    if (ticker && ticker.high_24h != null && ticker.low_24h != null) {
      rows.push(["24t høy/lav", `${nfPrice.format(ticker.high_24h)} / ${nfPrice.format(ticker.low_24h)}`]);
    }
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    });
  }

  function toPoints(hist, key) {
    if (!hist || !hist.length) return [];
    return hist
      .map((p) => {
        const y = p[key];
        if (y == null) return null;
        let x;
        if (typeof p.t === "number") x = p.t < 1e12 ? p.t : p.t / 1000;
        else {
          const d = parseOslo(p.t);
          x = d ? d.getTime() / 1000 : null;
        }
        if (x == null) return null;
        return { x, y };
      })
      .filter(Boolean);
  }

  function mergePrice(live, ticker) {
    const fromOhlc = toPoints(live.price_history || [], "p");
    const fromEq = toPoints(live.equity_history || [], "price");
    // Prefer denser OHLC/ticker history; append latest equity prices if newer
    let pts = fromOhlc.length >= fromEq.length ? fromOhlc : fromEq;
    if (fromOhlc.length && fromEq.length) pts = fromOhlc;
    const last = ticker && ticker.last;
    if (last != null) {
      const now = Date.now() / 1000;
      if (!pts.length || Math.abs(pts[pts.length - 1].y - last) > 0 || now - pts[pts.length - 1].x > 2) {
        pts = pts.concat([{ x: now, y: last }]);
      }
    }
    return pts;
  }

  function statusLabel(live) {
    if (!live || !live.available) return "Live-boten er under oppsett";
    if (live.circuit_breaker && live.circuit_breaker.triggered) {
      return live.circuit_breaker.reason || "Kretssperre utløst";
    }
    if (live.running) return "Kjører";
    if (live.status === "waiting") return "Venter";
    return "Stoppet";
  }

  function apply(data) {
    const live = data.live || { available: false };
    const paper = data.paper || { available: false };
    const ticker = data.ticker || {};
    const ccy = live.currency || "EUR";
    const price = (ticker.last != null ? ticker.last : live.equity_history && live.equity_history.length)
      ? ticker.last
      : null;
    const px = ticker.last != null ? ticker.last : null;

    const pill = el("live-pill");
    const dot = el("live-dot");
    const pillText = el("live-pill-text");
    pill.classList.remove("warn", "wait", "dim");
    dot.classList.remove("live", "off", "grey");
    if (!live.available) {
      pill.classList.add("wait");
      dot.classList.add("grey");
      pillText.textContent = "Venter";
    } else if (live.running && !(live.circuit_breaker && live.circuit_breaker.triggered)) {
      pillText.textContent = "Live";
      dot.classList.add("live");
    } else {
      pill.classList.add("warn");
      dot.classList.add("off");
      pillText.textContent = "Stoppet";
    }

    el("pair-label").textContent = (live.pair || "BTC/EUR").replace("BTC", "BTC/");
    if (el("pair-label").textContent.indexOf("/") === el("pair-label").textContent.lastIndexOf("/")) {
      el("pair-label").textContent = (live.pair || "BTCEUR").replace(/^BTC/, "BTC/");
    }
    // normalize BTCEUR -> BTC/EUR
    el("pair-label").textContent = String(live.pair || "BTCEUR").replace(/^(BTC)([A-Z]+)$/, "$1/$2");

    if (live.available && live.equity != null) {
      animateTo(el("equity"), "equity", live.equity, (v) => fmtMoney(v, ccy));
      animateTo(el("pnl"), "pnl", live.pnl || 0, (v) => {
        const pct = live.starting_capital ? (v / live.starting_capital) * 100 : live.pnl_pct;
        const extra = pct != null ? `  ${nfPct.format(pct)} %` : "";
        return `${nfSigned.format(v)} ${ccy}${extra}`;
      });
      setPnlClass(el("pnl"), live.pnl || 0);
    } else {
      el("equity").textContent = "—";
      el("pnl").textContent = "Live-boten er under oppsett";
      el("pnl").classList.remove("up", "down");
    }

    el("status-text").textContent = statusLabel(live);
    el("updated").textContent = "Sist oppdatert " + fmtTime(data.updated_at, false);

    animateTo(el("stat-price"), "price", px, (v) => fmtPrice(v, ccy));
    const quote = live.balances && live.balances.quote;
    const base = live.balances && live.balances.base;
    animateTo(el("stat-quote"), "quote", quote, (v) => fmtMoney(v, ccy));
    animateTo(el("stat-btc"), "btc", base, (v) => fmtBtc(v));
    el("stat-orders").textContent = live.available ? String((live.open_orders || []).length) : "—";

    const pts = live.available ? mergePrice(live, ticker) : toPoints((data.ticker && []) || [], "p");
    // If live not available, still chart ticker history if present — but we only attach history on bots.
    // Use live.price_history when waiting? not attached. Skip.
    const chartPts = live.available || (live.price_history && live.price_history.length)
      ? mergePrice(live, ticker)
      : [];
    // If bot waiting but we have ticker, build a 1-point chart
    const usePts = chartPts.length ? chartPts : (px != null ? [{ x: Date.now() / 1000, y: px }] : []);
    drawLineChart(el("price-chart"), usePts, { height: 180, lastLabel: px, color: TEAL });
    if (usePts.length >= 2) {
      const lo = Math.min(...usePts.map((p) => p.y));
      const hi = Math.min ? Math.max(...usePts.map((p) => p.y)) : px;
      el("price-range").textContent = `${nfPrice.format(lo)} – ${nfPrice.format(hi)}`;
    } else {
      el("price-range").textContent = "";
    }

    drawGrid(el("grid-chart"), live.grid, px);
    const openN = (live.open_orders || []).length;
    const totalN = live.grid && live.grid.levels ? live.grid.levels.length : 0;
    el("grid-sub").textContent = live.available
      ? `${openN} åpne · ${totalN} nivåer`
      : "";

    renderTrades(live.fills, ccy);
    if (live.available) renderMeta(live, ticker);
    else {
      el("meta-list").replaceChildren();
      const dt = document.createElement("dt");
      dt.textContent = "Live";
      const dd = document.createElement("dd");
      dd.textContent = "Under oppsett";
      el("meta-list").append(dt, dd);
    }

    // Paper — secondary
    if (paper && paper.available) {
      el("paper-panel").style.display = "";
      const pccy = paper.currency || "USD";
      animateTo(el("paper-equity"), "p-eq", paper.equity, (v) => fmtMoney(v, pccy));
      animateTo(el("paper-pnl"), "p-pnl", paper.pnl || 0, (v) => nfSigned.format(v) + " " + pccy);
      setPnlClass(el("paper-pnl"), paper.pnl || 0);
      const ppx = paper.ticker_last;
      animateTo(el("paper-price"), "p-px", ppx, (v) => fmtPrice(v, pccy));
      const ppts = toPoints(paper.price_history || [], "p");
      drawLineChart(el("paper-chart"), ppts, { height: 70, color: TEAL, fill: "rgba(34,211,197,0.10)" });
      const prun = paper.running ? "kjører" : (paper.status || "stoppet");
      const pord = (paper.open_orders || []).length;
      el("paper-foot").textContent = `BTC/USD · ${prun} · ${pord} åpne ordrer`;
      const ppill = el("paper-pill");
      ppill.classList.remove("warn");
      if (!paper.running) ppill.classList.add("warn");
    } else {
      el("paper-panel").style.display = "none";
    }
  }

  let lastData = null;
  async function poll() {
    try {
      const res = await fetch("data/state.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("status " + res.status);
      const data = await res.json();
      lastData = data;
      apply(data);
    } catch (err) {
      if (lastData) {
        el("updated").textContent = "Sist oppdatert " + fmtTime(lastData.updated_at) + " · midlertidig frakoblet";
      } else {
        el("status-text").textContent = "Kan ikke nå status akkurat nå";
      }
    }
  }

  // ----- optional code rain (page background) -----
  function startRain() {
    const canvas = el("rain");
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      canvas.style.display = "none";
      return;
    }
    const ctx = canvas.getContext("2d");
    const glyphs = "01アイウエオカキクケコ0101abcdefghijklmnopqrstuvwxyz";
    let cols = [];
    let w = 0, h = 0, font = 14, n = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      font = w < 600 ? 13 : 15;
      n = Math.max(8, Math.floor(w / 22));
      cols = Array.from({ length: n }, (_, i) => ({
        x: (i + 0.5) * (w / n),
        y: Math.random() * h,
        speed: 0.35 + Math.random() * 0.7,
      }));
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    let last = 0;
    function frame(t) {
      if (document.hidden) {
        requestAnimationFrame(frame);
        return;
      }
      if (t - last < 40) {
        requestAnimationFrame(frame);
        return;
      }
      last = t;
      ctx.fillStyle = "rgba(3,8,12,0.18)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = font + "px Geist Mono, ui-monospace, monospace";
      ctx.fillStyle = "rgba(61,255,154,0.55)";
      for (const c of cols) {
        const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        ctx.fillText(ch, c.x, c.y);
        c.y += c.speed * font;
        if (c.y > h + 20) {
          c.y = -Math.random() * 120;
          c.speed = 0.35 + Math.random() * 0.7;
        }
      }
      requestAnimationFrame(frame);
    }
    ctx.fillStyle = "#03080c";
    ctx.fillRect(0, 0, w, h);
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    if (lastData) apply(lastData);
  }, { passive: true });

  startRain();
  poll();
  setInterval(poll, POLL_MS);
})();
