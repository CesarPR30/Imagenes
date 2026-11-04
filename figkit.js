/* FigKit: lo común a las figuras del método. Cada página declara su estado, su
 * panel y su dibujo; aquí viven la carga de datos, el panel lateral, la
 * exportación y los trazos compartidos.
 *
 * Igual que figura-capas y figura-temporal: `?data=data/lima` cambia la carpeta de
 * datos, la configuración se guarda en el navegador y puede exportarse como
 * JSON, y el mismo código dibuja en un <canvas> (pantalla, PNG) o en un SvgCtx
 * (SVG vectorial). Se dibuja en unidades lógicas: 1 unidad = 1 px a 1×.
 *
 *   FigKit.page({key, title, sub, name, defaults, schema, size, draw})
 *     schema(S, D)      → [[título, abierto, [[clave, etiqueta, tipo, opciones]…]]…]
 *     size(S, D)        → [ancho, alto]
 *     draw(ctx, S, D)   → dibuja sobre el fondo ya pintado
 *   Tipos: range {min,max,step} · number · color · check · text · select [[v, t]…]
 */
(function (global) {
  "use strict";
  const CSS = `
:root{--bg:#f3f4f6;--panel:#ffffff;--ink:#1f2328;--muted:#667085;--line:#e3e6ea;--acc:#b4161d;--stage:#d9dce1}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171a;--panel:#1d2024;--ink:#e8eaed;--muted:#9aa1ab;--line:#2d3137;--acc:#f0565c;--stage:#0e0f11}}
:root[data-theme="dark"]{--bg:#15171a;--panel:#1d2024;--ink:#e8eaed;--muted:#9aa1ab;--line:#2d3137;--acc:#f0565c;--stage:#0e0f11}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
#app{display:flex;height:100vh}
#side{width:340px;min-width:340px;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding:12px 14px 40px}
#side h1{font-size:16px;margin:2px 0}
#side .sub{color:var(--muted);font-size:12px;margin-bottom:10px}
#side a{color:var(--acc)}
details{border-top:1px solid var(--line);padding:6px 0}
summary{cursor:pointer;font-weight:600;padding:4px 0;list-style:none}
summary::before{content:"▸ ";color:var(--muted)}
details[open]>summary::before{content:"▾ "}
.row{display:grid;grid-template-columns:130px 1fr 44px;gap:6px;align-items:center;margin:4px 0}
.row.wide{grid-template-columns:130px 1fr}
.row label{color:var(--muted);font-size:12px}
.row input[type=range]{width:100%}
.row input[type=number],.row input[type=text],.row select{width:100%;padding:3px 5px;border:1px solid var(--line);border-radius:5px;background:var(--panel);color:var(--ink);font:inherit}
.row .val{font-variant-numeric:tabular-nums;font-size:11px;color:var(--muted);text-align:right}
button{font:inherit;padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer;width:100%;margin:3px 0}
button.pri{background:var(--acc);color:#fff;border-color:var(--acc)}
#status{font-size:12px;margin:6px 0;color:var(--muted);min-height:16px}
#stage{flex:1;overflow:auto;background:var(--stage);display:flex;align-items:flex-start;justify-content:center;padding:18px}
#fig{background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.18);max-width:100%;height:auto}
#dims{position:fixed;right:14px;bottom:10px;font-size:11px;color:var(--muted);background:var(--panel);padding:3px 8px;border-radius:5px;border:1px solid var(--line)}
@media (max-width:800px){#app{flex-direction:column;height:auto}#side{width:100%;min-width:0;border-right:0}#stage{padding:16px}}`;

  const INK = "#1f2328", MUTED = "#5b6573";

  // ───────────────────────── página ─────────────────────────
  function page(cfg) {
    const params = new URLSearchParams(location.search);
    const DATA_DIR = params.get("data") || "data/sintetico";
    const EXPORT = {exportScale: "4", exportFormat: "png", transparent: false};
    const KEY = cfg.key + ".v1";
    let S = Object.assign({}, cfg.defaults, EXPORT), D = null;
    try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

    document.title = cfg.title;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    document.body.innerHTML = `<div id="app"><aside id="side"><h1></h1><div class="sub"></div><div id="status"></div><div id="controls"></div></aside><main id="stage"><canvas id="fig"></canvas></main></div><div id="dims"></div>`;
    document.querySelector("#side h1").textContent = cfg.title;
    document.querySelector("#side .sub").innerHTML = cfg.sub + ' <a href="index.html">Todas las figuras →</a>';
    const status = t => { document.getElementById("status").textContent = t; };

    function paint(ctx, sc, transparent) {
      const [w, h] = cfg.size(S, D);
      ctx.save(); ctx.scale(sc, sc);
      if (!transparent) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
      cfg.draw(ctx, S, D);
      ctx.restore();
    }
    function render() {
      const cv = document.getElementById("fig"), [w, h] = cfg.size(S, D);
      cv.width = w * 2; cv.height = h * 2; cv.style.width = w + "px";
      paint(cv.getContext("2d"), 2, false);
      document.getElementById("dims").textContent = `${w} × ${h} · ${S.exportFormat === "svg" ? "SVG" : S.exportScale + "×"}`;
    }
    function download(blob, name) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    /* Devuelve el SVG o el PNG (dataURL) sin pasar por una descarga. */
    function exported(format, scale) {
      const [w, h] = cfg.size(S, D);
      if (format === "svg") { const sv = new SvgCtx(w, h); paint(sv, 1, S.transparent); return sv.toSVG(); }
      const cv = Object.assign(document.createElement("canvas"), {width: w * scale, height: h * scale});
      paint(cv.getContext("2d"), scale, S.transparent);
      return cv.toDataURL("image/png");
    }
    const ACTIONS = {
      download() {
        if (S.exportFormat === "svg") return download(new Blob([exported("svg")], {type: "image/svg+xml"}), `${cfg.name}.svg`);
        const [w, h] = cfg.size(S, D), sc = +S.exportScale;
        const cv = Object.assign(document.createElement("canvas"), {width: w * sc, height: h * sc});
        paint(cv.getContext("2d"), sc, S.transparent);
        cv.toBlob(b => download(b, `${cfg.name}_${sc}x.png`), "image/png");
      },
      json() { download(new Blob([JSON.stringify(S, null, 2)], {type: "application/json"}), `${cfg.name}_config.json`); },
      load() {
        const i = document.createElement("input"); i.type = "file"; i.accept = ".json";
        i.onchange = async () => { try { Object.assign(S, JSON.parse(await i.files[0].text())); save(); controls(); render(); } catch (e) { status("JSON no válido"); } };
        i.click();
      },
      reset() { S = Object.assign({}, cfg.defaults, EXPORT); save(); controls(); render(); },
    };

    function controls() {
      const root = document.getElementById("controls"), open = {};
      root.querySelectorAll("details").forEach(d => { open[d.dataset.k] = d.open; });
      root.innerHTML = "";
      const groups = [...cfg.schema(S, D), ["Exportar", true, [
        ["exportFormat", "Formato", "select", [["png", "PNG"], ["svg", "SVG vectorial"]]],
        ["exportScale", "Escala PNG", "select", [["2", "2×"], ["3", "3×"], ["4", "4×"], ["6", "6×"]]],
        ["transparent", "Fondo transparente", "check"],
        ["!download", "Descargar figura", "pri"], ["!json", "Guardar configuración"], ["!load", "Cargar configuración"], ["!reset", "Restablecer"],
      ]]];
      for (const [title, isOpen, items] of groups) {
        const det = document.createElement("details"); det.dataset.k = title;
        det.open = title in open ? open[title] : isOpen;
        det.innerHTML = `<summary>${title}</summary>`; root.appendChild(det);
        for (const [key, label, type, opt] of items) {
          if (key[0] === "!") {
            const b = document.createElement("button"); b.textContent = label; if (opt === "pri") b.className = "pri";
            b.onclick = () => ACTIONS[key.slice(1)](); det.appendChild(b); continue;
          }
          const row = document.createElement("div"); row.className = "row" + (type === "range" ? "" : " wide");
          const lab = document.createElement("label"); lab.textContent = label; row.appendChild(lab);
          let inp;
          if (type === "select") {
            inp = document.createElement("select");
            opt.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; inp.appendChild(o); });
            inp.value = S[key];
          } else {
            inp = document.createElement("input"); inp.type = type === "check" ? "checkbox" : type;
            if (opt && typeof opt === "object") Object.assign(inp, opt);
            if (type === "check") inp.checked = !!S[key]; else inp.value = S[key];
          }
          row.appendChild(inp);
          const val = document.createElement("span"); val.className = "val";
          if (type === "range") { val.textContent = S[key]; row.appendChild(val); }
          inp.addEventListener(type === "range" ? "input" : "change", () => {
            S[key] = type === "check" ? inp.checked : (type === "range" || type === "number") ? +inp.value : inp.value;
            val.textContent = S[key]; save(); render();
          });
          det.appendChild(row);
        }
      }
    }

    (async () => {
      status("Cargando datos…");
      try {
        const r = await fetch(`${DATA_DIR}/metodo.json`); if (!r.ok) throw new Error("HTTP " + r.status);
        D = await r.json();
      } catch (e) { status(`No se pudo leer ${DATA_DIR}/metodo.json. Sirve la carpeta por HTTP (python -m http.server).`); return; }
      await document.fonts.ready;
      status(D.meta.synthetic ? `Delitos simulados · ${D.meta.network}` : `Datos reales · ${D.meta.dataset}`);
      controls(); render();
      global.FigKitReady = {exported, set(o) { Object.assign(S, o); render(); }, size: () => cfg.size(S, D)};
    })();
  }

  // ───────────────────────── trazos ─────────────────────────
  const hex = h => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  function ramp3(c0, c1, c2, t) {
    t = Math.max(0, Math.min(1, t));
    const [a, b, u] = t < .5 ? [hex(c0), hex(c1), t * 2] : [hex(c1), hex(c2), (t - .5) * 2];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(",")})`;
  }
  /* Viridis por tramos: la paleta del paso del tiempo en las trayectorias. */
  const VIR = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];
  function viridis(t) {
    t = Math.max(0, Math.min(1, t)) * (VIR.length - 1);
    const i = Math.min(Math.floor(t), VIR.length - 2), a = hex(VIR[i]), b = hex(VIR[i + 1]), u = t - i;
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * u)).join(",")})`;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  /* Marco de mapa en la estética de los recuadros de figura-temporal: esquina redondeada y recorte. */
  function mapFrame(ctx, x, y, w, h, S, inner) {
    ctx.save(); rrect(ctx, x, y, w, h, S.radius); ctx.fillStyle = S.land; ctx.fill(); ctx.clip(); inner(); ctx.restore();
    rrect(ctx, x, y, w, h, S.radius); ctx.strokeStyle = S.frame; ctx.lineWidth = S.frameW; ctx.stroke();
  }
  /* Vista de un cuadrado de lado 2R centrado en (cx, cy) dentro de un rectángulo de la figura. */
  const view = (x, y, w, h, cx, cy, R) => { const k = Math.min(w, h) / (2 * R); return p => [x + w / 2 + (p[0] - cx) * k, y + h / 2 + (p[1] - cy) * k]; };
  function polyline(ctx, V, seg) {
    ctx.beginPath();
    seg.forEach((p, i) => { const q = V(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.stroke();
  }
  function streets(ctx, V, segs, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
    segs.forEach(s => polyline(ctx, V, s));
  }
  function dot(ctx, x, y, r, fill, stroke, sw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw || 1; ctx.stroke(); }
  }
  function square(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
  function star(ctx, x, y, r, fill, stroke, sw) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r;
      const px = x + q * Math.cos(a), py = y + q * Math.sin(a); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke();
  }
  function line(ctx, x0, y0, x1, y1, color, w, dash) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
  }
  function text(ctx, s, x, y, font, color, align, base) {
    ctx.font = font; ctx.fillStyle = color || INK; ctx.textAlign = align || "left"; ctx.textBaseline = base || "alphabetic";
    ctx.fillText(s, x, y);
  }
  /* Texto con tramos: [["F", "i"], ["1", "sub"], [" = 0.75"]]. i cursiva, sub subíndice, sup superíndice. */
  function rich(ctx, parts, x, y, S, opt = {}) {
    const fs = opt.size || S.fontSize, base = opt.weight ? opt.weight + " " : "", col = opt.color || INK;
    const fontOf = k => `${k === "i" || k === "subi" ? "italic " : ""}${base}${(k === "sub" || k === "subi" || k === "sup") ? fs * .68 : fs}px ${S.font}`;
    let W = 0;
    for (const [t, k] of parts) { ctx.font = fontOf(k); W += ctx.measureText(t).width; }
    let cx = opt.align === "center" ? x - W / 2 : opt.align === "right" ? x - W : x;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = col;
    for (const [t, k] of parts) {
      ctx.font = fontOf(k);
      ctx.fillText(t, cx, y + ((k === "sub" || k === "subi") ? fs * .24 : k === "sup" ? -fs * .36 : 0));
      cx += ctx.measureText(t).width;
    }
    return W;
  }
  /* Título de panel: «(a) Texto». */
  function panelTitle(ctx, letter, title, x, y, S) {
    const parts = Array.isArray(title) ? title : [[title]];
    rich(ctx, [[`(${letter}) `], ...parts], x, y, S, {weight: "600", color: S.titleColor || INK});
  }
  function scaleBar(ctx, V, cx, cy, R, metres, S) {
    const a = V([cx - .9 * R, cy + .88 * R]), b = V([cx - .9 * R + metres, cy + .88 * R]);
    const fs = S.fontSize * .72;
    ctx.save(); ctx.globalAlpha = .82; ctx.fillStyle = "#ffffff"; ctx.fillRect(a[0] - 8, a[1] - fs * 1.55, b[0] - a[0] + 16, fs * 1.55 + 8); ctx.restore();
    line(ctx, a[0], a[1], b[0], a[1], INK, 4);
    text(ctx, `${metres} m`, (a[0] + b[0]) / 2, a[1] - 9, `${fs}px ${S.font}`, INK, "center");
  }
  /* Ejes: escalas lineales sobre un rectángulo de la figura. */
  const scale = (d0, d1, r0, r1) => v => r0 + (v - d0) / ((d1 - d0) || 1) * (r1 - r0);
  function axisBox(ctx, x, y, w, h) {
    line(ctx, x, y, x, y + h, MUTED, 1.4); line(ctx, x, y + h, x + w, y + h, MUTED, 1.4);
  }
  function legend(ctx, items, x, y, S, opt = {}) {
    /* items: {label|parts, draw(ctx, cx, cy)}; fila horizontal que se parte en maxW. */
    const fs = (opt.size || .8) * S.fontSize, key = opt.key || fs * 1.5, gap = opt.gap || fs * 1.1, maxW = opt.maxW || 1e9;
    let cx = x, cy = y;
    for (const it of items) {
      const parts = it.parts || [[it.label]];
      ctx.font = `${fs}px ${S.font}`;
      const tw = parts.reduce((a, [t, k]) => { ctx.font = `${k === "i" ? "italic " : ""}${k && k.startsWith("sub") ? fs * .68 : fs}px ${S.font}`; return a + ctx.measureText(t).width; }, 0);
      if (cx > x && cx + key + 6 + tw > x + maxW) { cx = x; cy += fs * 1.45; }
      it.draw(ctx, cx + key / 2, cy - fs * .32, key);
      rich(ctx, parts, cx + key + 6, cy, S, {size: fs});
      cx += key + 6 + tw + gap;
    }
    return cy;
  }

  global.FigKit = {page, ramp3, viridis, rrect, mapFrame, view, polyline, streets, dot, square, star, line, text, rich, panelTitle, scaleBar, scale, axisBox, legend, INK, MUTED};
})(window);
