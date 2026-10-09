/* SvgCtx: subconjunto de la API de Canvas 2D que, en vez de pintar píxeles,
 * escribe elementos SVG. Las páginas de figuras dibujan con el mismo código en
 * un <canvas> (pantalla y PNG) o en un SvgCtx (exportación vectorial).
 *
 * Cubre lo que usan figura-capas.html y figura-temporal.html: trazados
 * (moveTo, lineTo, arc, quadraticCurveTo, rect), fill/stroke, fillRect,
 * strokeRect, clip, save/restore, transformaciones, globalAlpha, sombras
 * (feDropShadow), degradados lineales, texto y drawImage. Un SvgCtx dibujado
 * con drawImage dentro de otro se inserta como grupo vectorial; un <canvas>
 * (el raster del KDE) se inserta como <image> en PNG.
 */
(function (global) {
  "use strict";
  let uid = 0;
  const nid = p => `${p}${++uid}`;
  const f = v => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? "0" : String(r); };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const mul = (m, n) => [m[0]*n[0] + m[2]*n[1], m[1]*n[0] + m[3]*n[1], m[0]*n[2] + m[2]*n[3], m[1]*n[2] + m[3]*n[3], m[0]*n[4] + m[2]*n[5] + m[4], m[1]*n[4] + m[3]*n[5] + m[5]];

  function parseColor(c) {
    if (typeof c !== "string") return ["#000", 1];
    const m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(",").map(s => parseFloat(s));
      return [`rgb(${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])})`, p.length > 3 ? p[3] : 1];
    }
    return [c, 1];
  }

  const PROPS = ["fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin", "globalAlpha", "font", "textAlign",
                 "textBaseline", "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY"];

  class SvgCtx {
    constructor(w = 0, h = 0) {
      this.width = w; this.height = h;
      this.out = []; this.defs = [];
      this.stack = []; this.d = "";
      this.st = {m: [1, 0, 0, 1, 0, 0], fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
                 dash: [], globalAlpha: 1, font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic",
                 shadowColor: "rgba(0,0,0,0)", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, groups: 0};
      this._filters = {};
      this._measure = document.createElement("canvas").getContext("2d");
      this.imageSmoothingEnabled = true; this.imageSmoothingQuality = "high";
    }
    getContext() { return this; }

    // ── estado ──
    save() { this.stack.push(this.st); this.st = {...this.st, m: [...this.st.m], dash: [...this.st.dash], groups: 0}; }
    restore() {
      for (let i = 0; i < this.st.groups; i++) this.out.push("</g>");
      if (this.stack.length) this.st = this.stack.pop();
    }
    setLineDash(a) { this.st.dash = [...a]; }
    getLineDash() { return [...this.st.dash]; }

    // ── transformaciones ──
    setTransform(a, b, c, d, e, g) {
      if (typeof a === "object") this.st.m = [a.a, a.b, a.c, a.d, a.e, a.f];
      else this.st.m = [a, b, c, d, e, g];
    }
    resetTransform() { this.st.m = [1, 0, 0, 1, 0, 0]; }
    getTransform() { const m = this.st.m; return {a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5]}; }
    transform(a, b, c, d, e, g) { this.st.m = mul(this.st.m, [a, b, c, d, e, g]); }
    translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
    scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
    rotate(t) { const c = Math.cos(t), s = Math.sin(t); this.transform(c, s, -s, c, 0, 0); }

    // ── trazados ──
    beginPath() { this.d = ""; }
    moveTo(x, y) { this.d += `M${f(x)} ${f(y)}`; }
    lineTo(x, y) { this.d += (this.d ? "L" : "M") + `${f(x)} ${f(y)}`; }
    closePath() { if (this.d) this.d += "Z"; }
    quadraticCurveTo(cx, cy, x, y) { this.d += `Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`; }
    bezierCurveTo(a, b, c, d, x, y) { this.d += `C${f(a)} ${f(b)} ${f(c)} ${f(d)} ${f(x)} ${f(y)}`; }
    arcTo(x1, y1) { this.lineTo(x1, y1); }  // sin uso en las figuras; se aproxima con la esquina
    rect(x, y, w, h) { this.d += `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`; }
    arc(x, y, r, a0, a1, ccw) {
      if (Math.abs(a1 - a0) >= 2 * Math.PI - 1e-9) {
        this.d += `${this.d ? "L" : "M"}${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 1 1 ${f(x - r)} ${f(y)}A${f(r)} ${f(r)} 0 1 1 ${f(x + r)} ${f(y)}`;
        return;
      }
      const sx = x + r * Math.cos(a0), sy = y + r * Math.sin(a0), ex = x + r * Math.cos(a1), ey = y + r * Math.sin(a1);
      let sweep = ccw ? a0 - a1 : a1 - a0; sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      this.d += `${this.d ? "L" : "M"}${f(sx)} ${f(sy)}A${f(r)} ${f(r)} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${f(ex)} ${f(ey)}`;
    }

    // ── atributos ──
    _mat() { const m = this.st.m; return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0 ? "" : ` transform="matrix(${m.map(f).join(" ")})"`; }
    _paint(kind, v) {
      if (v && v._grad) {
        const id = nid("g");
        this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(v.x0)}" y1="${f(v.y0)}" x2="${f(v.x1)}" y2="${f(v.y1)}">` +
          v.stops.map(([o, c]) => { const [rgb, a] = parseColor(c); return `<stop offset="${f(o)}" stop-color="${rgb}"${a < 1 ? ` stop-opacity="${f(a)}"` : ""}/>`; }).join("") + "</linearGradient>");
        return ` ${kind}="url(#${id})"`;
      }
      const [rgb, a] = parseColor(v);
      return ` ${kind}="${rgb}"${a < 1 ? ` ${kind}-opacity="${f(a)}"` : ""}`;
    }
    _extra() {
      let s = this.st.globalAlpha < 1 ? ` opacity="${f(this.st.globalAlpha)}"` : "";
      const [rgb, a] = parseColor(this.st.shadowColor);
      if (a > 0 && (this.st.shadowBlur > 0 || this.st.shadowOffsetX || this.st.shadowOffsetY)) {
        const key = [rgb, a, this.st.shadowBlur, this.st.shadowOffsetX, this.st.shadowOffsetY].join("|");
        if (!this._filters[key]) {
          const id = nid("s"); this._filters[key] = id;
          this.defs.push(`<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="${f(this.st.shadowOffsetX)}" dy="${f(this.st.shadowOffsetY)}" stdDeviation="${f(this.st.shadowBlur / 2)}" flood-color="${rgb}" flood-opacity="${f(a)}"/></filter>`);
        }
        s += ` filter="url(#${this._filters[key]})"`;
      }
      return s;
    }
    _strokeAttrs() {
      const st = this.st;
      return this._paint("stroke", st.strokeStyle) + ` stroke-width="${f(st.lineWidth)}"` +
        (st.lineCap !== "butt" ? ` stroke-linecap="${st.lineCap}"` : "") + (st.lineJoin !== "miter" ? ` stroke-linejoin="${st.lineJoin}"` : "") +
        (st.dash.length ? ` stroke-dasharray="${st.dash.map(f).join(" ")}"` : "");
    }

    // ── pintar ──
    fill() { if (this.d) this.out.push(`<path d="${this.d}"${this._mat()}${this._paint("fill", this.st.fillStyle)}${this._extra()}/>`); }
    stroke() { if (this.d) this.out.push(`<path d="${this.d}"${this._mat()} fill="none"${this._strokeAttrs()}${this._extra()}/>`); }
    fillRect(x, y, w, h) { this.out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${this._mat()}${this._paint("fill", this.st.fillStyle)}${this._extra()}/>`); }
    strokeRect(x, y, w, h) { this.out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${this._mat()} fill="none"${this._strokeAttrs()}${this._extra()}/>`); }
    clearRect() {}
    clip() {
      if (!this.d) return;
      const id = nid("c");
      this.defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${this.d}"${this._mat()}/></clipPath>`);
      this.out.push(`<g clip-path="url(#${id})">`); this.st.groups++;
    }
    createLinearGradient(x0, y0, x1, y1) { return {_grad: true, x0, y0, x1, y1, stops: [], addColorStop(o, c) { this.stops.push([o, c]); }}; }

    // ── texto ──
    measureText(t) { this._measure.font = this.st.font; return this._measure.measureText(t); }
    fillText(t, x, y) {
      const anchor = {left: "start", start: "start", right: "end", end: "end", center: "middle"}[this.st.textAlign] || "start";
      const base = {middle: "central", top: "hanging", hanging: "hanging", bottom: "text-after-edge", alphabetic: "alphabetic"}[this.st.textBaseline] || "alphabetic";
      this.out.push(`<text x="${f(x)}" y="${f(y)}"${this._mat()} style="font:${esc(this.st.font)}" text-anchor="${anchor}"` +
        (base !== "alphabetic" ? ` dominant-baseline="${base}"` : "") + `${this._paint("fill", this.st.fillStyle)}${this._extra()}>${esc(t)}</text>`);
    }

    // ── imágenes ──
    drawImage(img, dx = 0, dy = 0, dw, dh) {
      if (img instanceof SvgCtx) {
        dw = dw ?? img.width; dh = dh ?? img.height;
        const id = nid("c");
        this.defs.push(...img.defs, `<clipPath id="${id}"><rect width="${f(img.width)}" height="${f(img.height)}"/></clipPath>`);
        const m = mul(this.st.m, [dw / img.width, 0, 0, dh / img.height, dx, dy]);
        this.out.push(`<g transform="matrix(${m.map(f).join(" ")})" clip-path="url(#${id})"${this.st.globalAlpha < 1 ? ` opacity="${f(this.st.globalAlpha)}"` : ""}>`,
          ...img.body(), "</g>");
        return;
      }
      dw = dw ?? img.width; dh = dh ?? img.height;
      const href = img.toDataURL ? img.toDataURL("image/png") : img.src;
      this.out.push(`<image href="${href}" x="${f(dx)}" y="${f(dy)}" width="${f(dw)}" height="${f(dh)}" preserveAspectRatio="none"${this._mat()}${this._extra()}/>`);
    }

    // ── salida ──
    body() {
      const close = [];
      let st = this.st, stack = [...this.stack];
      for (;;) { for (let i = 0; i < st.groups; i++) close.push("</g>"); if (!stack.length) break; st = stack.pop(); }
      return [...this.out, ...close];
    }
    toSVG() {
      return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
        `width="${f(this.width)}" height="${f(this.height)}" viewBox="0 0 ${f(this.width)} ${f(this.height)}">\n` +
        `<defs>${this.defs.join("")}</defs>\n${this.body().join("\n")}\n</svg>\n`;
    }
  }
  for (const p of PROPS) {
    if (p === "lineDash") continue;
    Object.defineProperty(SvgCtx.prototype, p, {get() { return this.st[p]; }, set(v) { this.st[p] = v; }});
  }
  global.SvgCtx = SvgCtx;
})(window);
