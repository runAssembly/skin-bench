// SKIN BENCH — every look here is a pure pixel transform. No model call, no upload, no per-use
// cost, deterministic. The one exception is the CUTOUT tier at the bottom, which runs a 4.6MB
// segmentation model (u2netp) locally in this browser — still no upload and still no per-use cost,
// but it needs one ~10s pass per photo, so it is opt-in and the mask is cached and reused.
//
// Looks that INVENT CONTENT (paint-by-number, cross stitch, low poly, toon) are deliberately
// absent: they cannot be done this way and would each cost a real generation.

const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function levels(d) {
  const h = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) h[lum(d[i], d[i+1], d[i+2]) | 0]++;
  const n = d.length / 4; let lo = 0, hi = 255, c = 0;
  for (let i = 0; i < 256; i++) { c += h[i]; if (c > n * 0.01) { lo = i; break; } }
  c = 0; for (let i = 255; i >= 0; i--) { c += h[i]; if (c > n * 0.01) { hi = i; break; } }
  return { lo, span: Math.max(hi - lo, 1) };
}
const grayOf = (d, i, lv) => Math.min(1, Math.max(0, (lum(d[i], d[i+1], d[i+2]) - lv.lo) / lv.span));

function px(ctx, w, h, fn) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data, lv = levels(d);
  for (let i = 0; i < d.length; i += 4) fn(d, i, grayOf(d, i, lv), (i / 4) % w, (i / 4 / w) | 0);
  ctx.putImageData(img, 0, 0);
}
const duo = (loRGB, hiRGB) => (ctx, w, h) => px(ctx, w, h, (d, i, g) => {
  for (let c = 0; c < 3; c++) d[i+c] = clamp(hiRGB[c] + (loRGB[c] - hiRGB[c]) * (1 - g));
});
const ramp = stops => (ctx, w, h) => px(ctx, w, h, (d, i, g) => {
  const t = g * (stops.length - 1), k = Math.min(stops.length - 2, t | 0), f = t - k;
  for (let c = 0; c < 3; c++) d[i+c] = clamp(stops[k][c] + (stops[k+1][c] - stops[k][c]) * f);
});
function noise(ctx, w, h, amt, seed) {
  let s = seed || 1; const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const n = ((s >>> 16) / 65535 - 0.5) * amt;
    d[i] = clamp(d[i] + n); d[i+1] = clamp(d[i+1] + n); d[i+2] = clamp(d[i+2] + n);
  }
  ctx.putImageData(img, 0, 0);
}

const SKINS = [
  ['Halftone', (ctx, w, h) => {
    const d = ctx.getImageData(0, 0, w, h).data, lv = levels(d);
    ctx.fillStyle = '#f2f0ea'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#111';
    // Ink compressed to 0.06..0.86: a full 0..1 range crushed the image to near 1-bit.
    const cell = Math.max(4, Math.round(Math.min(w, h) / 120));
    const a = 15 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const diag = Math.ceil(Math.hypot(w, h)) + cell;
    for (let v = -diag; v < diag; v += cell) for (let u = -diag; u < diag; u += cell) {
      const x = u * ca - v * sa + w / 2, y = u * sa + v * ca + h / 2;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const ink = 0.06 + (1 - grayOf(d, (((y | 0) * w) + (x | 0)) * 4, lv)) * 0.80;
      const r = cell * 0.72 * Math.sqrt(ink);            // dot AREA tracks ink, not radius
      if (r < 0.35) continue;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
  }],
  ['Newsprint', (ctx, w, h) => { px(ctx, w, h, (d, i, g) => { const v = g > 0.5 ? 238 : 26;
      d[i] = v; d[i+1] = v; d[i+2] = v; }); noise(ctx, w, h, 26, 9); }],
  ['Risograph', (ctx, w, h) => {
    const d = ctx.getImageData(0, 0, w, h).data, lv = levels(d);
    const out = ctx.createImageData(w, h), o = out.data;
    const off = Math.max(1, Math.round(w / 260));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, is = (y * w + Math.min(w - 1, x + off)) * 4;
      const g = grayOf(d, i, lv), g2 = grayOf(d, is, lv);
      o[i] = clamp(245 - (1 - g2) * 205); o[i+1] = clamp(238 - (1 - g) * 228);
      o[i+2] = clamp(232 - (1 - g) * 90); o[i+3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }],
  ['Blueprint', (ctx, w, h) => {
    const d = ctx.getImageData(0, 0, w, h).data, lv = levels(d);
    const out = ctx.createImageData(w, h), o = out.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const gx = grayOf(d, (y * w + Math.min(w-1, x+1)) * 4, lv) - grayOf(d, (y * w + Math.max(0, x-1)) * 4, lv);
      const gy = grayOf(d, (Math.min(h-1, y+1) * w + x) * 4, lv) - grayOf(d, (Math.max(0, y-1) * w + x) * 4, lv);
      const e = Math.min(1, Math.hypot(gx, gy) * 3.2);
      o[i] = clamp(22 + e * 210); o[i+1] = clamp(58 + e * 195);
      o[i+2] = clamp(122 + e * 130); o[i+3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }],
  ['Cyanotype', (ctx, w, h) => { duo([12,46,92], [222,226,214])(ctx, w, h); noise(ctx, w, h, 12, 3); }],
  ['Sepia Print', (ctx, w, h) => { duo([44,28,16], [236,222,192])(ctx, w, h); noise(ctx, w, h, 10, 5); }],
  ['Solarised', (ctx, w, h) => px(ctx, w, h, (d, i, g) => {
      const v = clamp((g < 0.5 ? g * 2 : (1 - g) * 2) * 255);
      d[i] = v; d[i+1] = clamp(v * 0.94); d[i+2] = clamp(v * 0.82); })],
  ['Photogram', (ctx, w, h) => px(ctx, w, h, (d, i, g) => {
      const v = clamp((1 - g) * 255); d[i] = v; d[i+1] = v; d[i+2] = v; })],
  ['Redscale', (ctx, w, h) => px(ctx, w, h, (d, i, g) => {
      d[i] = clamp(40 + g * 215); d[i+1] = clamp(g * g * 150); d[i+2] = clamp(g*g*g * 70); })],
  ['CRT Scan', (ctx, w, h) => {
    const d = ctx.getImageData(0, 0, w, h).data;
    const out = ctx.createImageData(w, h), o = out.data;
    const sh = Math.max(1, Math.round(w / 300));
    for (let y = 0; y < h; y++) {
      const line = (y % 3 === 0) ? 0.42 : 1.10;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        o[i] = clamp(d[(y * w + Math.max(0, x - sh)) * 4] * line);
        o[i+1] = clamp(d[i+1] * line);
        o[i+2] = clamp(d[(y * w + Math.min(w-1, x + sh)) * 4 + 2] * line);
        o[i+3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0); noise(ctx, w, h, 20, 11);
  }],
  ['Teletext', (ctx, w, h) => {
    const bayer = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
    const pal = [[16,16,24],[214,32,48],[42,168,92],[228,196,42],[46,96,208],[226,226,222]];
    px(ctx, w, h, (d, i, g, x, y) => {
      const t = bayer[y & 3][x & 3] / 16 - 0.5;
      const tgt = [clamp(d[i] + t*70), clamp(d[i+1] + t*70), clamp(d[i+2] + t*70)];
      let best = 0, bd = 1e9;
      for (let k = 0; k < pal.length; k++) {
        const dd = (pal[k][0]-tgt[0])**2 + (pal[k][1]-tgt[1])**2 + (pal[k][2]-tgt[2])**2;
        if (dd < bd) { bd = dd; best = k; }
      }
      d[i] = pal[best][0]; d[i+1] = pal[best][1]; d[i+2] = pal[best][2];
    });
  }],
  ['Night Vision', (ctx, w, h) => {
    px(ctx, w, h, (d, i, g, x, y) => {
      const cx = (x/w - 0.5) * 2, cy = (y/h - 0.5) * 2;
      const v = Math.pow(g, 0.62) * Math.max(0, 1 - (cx*cx + cy*cy) * 0.62);
      d[i] = clamp(v * 40); d[i+1] = clamp(v * 255); d[i+2] = clamp(v * 70);
    });
    noise(ctx, w, h, 44, 17);
  }],
  ['Dead Pixels', (ctx, w, h) => {
    let s = 99;
    px(ctx, w, h, (d, i, g, x, y) => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const r = (s >>> 12) % 1000;
      if (r < 6) { d[i] = 255; d[i+1] = 0; d[i+2] = 190; }
      else if (r < 12) { d[i] = 0; d[i+1] = 0; d[i+2] = 0; }
      else if ((x >> 1) % 2 === 0 && (y >> 1) % 2 === 0) d[i] = clamp(d[i] * 1.12);
    });
  }],
  ['Thermal', ramp([[0,0,12],[58,12,102],[158,20,90],[226,74,30],[248,168,22],[255,248,196]])],
  ['Aerochrome', (ctx, w, h) => {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      d[i] = clamp(g * 1.12); d[i+1] = clamp(b * 0.92); d[i+2] = clamp(r * 0.86);
    }
    ctx.putImageData(img, 0, 0);
  }],
  ['Blue Negative', (ctx, w, h) => px(ctx, w, h, (d, i) => {
      d[i] = clamp(255 - d[i] * 1.05); d[i+1] = clamp(245 - d[i+1]); d[i+2] = clamp(255 - d[i+2] * 0.55); })],
  ['Posterise', (ctx, w, h) => px(ctx, w, h, (d, i) => {
      for (let c = 0; c < 3; c++) d[i+c] = Math.round(d[i+c] / 56) * 56; })],
  ['Tone Silhouette', (ctx, w, h) => px(ctx, w, h, (d, i, g) => {
      // Luminance-based, NOT segmented. Only reads when the subject is clearly darker than its
      // ground — the real one is in the cutout tier. Named so the difference is visible.
      const on = g < 0.46;
      d[i] = on ? 18 : 236; d[i+1] = on ? 20 : 232; d[i+2] = on ? 26 : 220; })],
];

// --- cutout tier ------------------------------------------------------------------------------
// One ~10s local model pass per photo, cached; then every look below is instant pixel maths.
const FIELDS = [[38,146,178],[226,62,52],[232,88,26],[122,168,116],[196,26,108],[24,112,196]];
function pickField(d) {                       // strongest-chroma pixel family in the photo
  let br = 0, bg = 0, bb = 0, best = -1;
  for (let i = 0; i < d.length; i += 4 * 101) {
    const mx = Math.max(d[i], d[i+1], d[i+2]), mn = Math.min(d[i], d[i+1], d[i+2]);
    if (mx - mn > best) { best = mx - mn; br = d[i]; bg = d[i+1]; bb = d[i+2]; }
  }
  let bi = 0, bd = 1e9;
  FIELDS.forEach((f, k) => { const dd = (f[0]-br)**2 + (f[1]-bg)**2 + (f[2]-bb)**2;
                             if (dd < bd) { bd = dd; bi = k; } });
  return FIELDS[bi];
}
const maskAt = (mask, x, y, w, h) =>
  mask[((y * 320 / h) | 0) * 320 + ((x * 320 / w) | 0)];

const CUTS = [
  ['True Silhouette', (ctx, w, h, mask) => {
    const f = pickField(ctx.getImageData(0, 0, w, h).data);
    px(ctx, w, h, (d, i, g, x, y) => {
      const on = maskAt(mask, x, y, w, h) > 0.5;
      d[i] = on ? f[0] : 240; d[i+1] = on ? f[1] : 238; d[i+2] = on ? f[2] : 232;
    });
  }],
  ['Cut to Flat', (ctx, w, h, mask) => {
    const f = pickField(ctx.getImageData(0, 0, w, h).data);
    px(ctx, w, h, (d, i, g, x, y) => {
      if (maskAt(mask, x, y, w, h) <= 0.5) { d[i] = f[0]; d[i+1] = f[1]; d[i+2] = f[2]; }
    });
  }],
  ['Ghost Ground', (ctx, w, h, mask) => px(ctx, w, h, (d, i, g, x, y) => {
      if (maskAt(mask, x, y, w, h) > 0.5) return;
      const v = lum(d[i], d[i+1], d[i+2]) * 0.55 + 90;
      d[i] = clamp(v); d[i+1] = clamp(v); d[i+2] = clamp(v); })],
  ['Two-Panel', (ctx, w, h, mask) => {
    // The figure/ground poster: flat field with the photographic cutout above, the real photo
    // with a flat silhouette below, both in the SAME colour. Seam dead centre, as measured.
    const src = ctx.getImageData(0, 0, w, h);
    const f = pickField(src.data);
    const seam = h >> 1;
    // ⛔ Mapping the WHOLE image into each half squashed everything 2:1. Each half instead shows a
    //    1:1 BAND of the source, height = seam, centred on the subject so it cannot be cropped off.
    let sum = 0, n = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2)
      if (maskAt(mask, x, y, w, h) > 0.5) { sum += y; n++; }
    const cy = n ? sum / n : h / 2;
    const band = Math.max(0, Math.min(h - seam, Math.round(cy - seam / 2)));
    const out = ctx.createImageData(w, h), o = out.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const sy = band + (y >= seam ? y - seam : y);
      const j = (sy * w + x) * 4;
      const on = maskAt(mask, x, sy, w, h) > 0.5;
      if (y >= seam) {                                   // lower: real photo, flat silhouette
        o[i] = on ? f[0] : src.data[j];
        o[i+1] = on ? f[1] : src.data[j+1];
        o[i+2] = on ? f[2] : src.data[j+2];
      } else {                                           // upper: flat field, photographic cutout
        o[i] = on ? src.data[j] : f[0];
        o[i+1] = on ? src.data[j+1] : f[1];
        o[i+2] = on ? src.data[j+2] : f[2];
      }
      o[i+3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }],
];

// --- engine -----------------------------------------------------------------------------------
const $ = s => document.querySelector(s);
let sourceImg = null, mask = null, strength = 1, stackWith = null, exportSize = 'native';

function applyOne(entry, ctx, w, h) {
  if (entry.cut) { if (!mask) return; entry.fn(ctx, w, h, mask); }
  else entry.fn(ctx, w, h);
}

function draw(entry, cv, img, maxDim) {
  const sc = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const before = ctx.getImageData(0, 0, w, h);
  if (stackWith !== null) applyOne(stackWith, ctx, w, h);
  applyOne(entry, ctx, w, h);
  if (strength < 1) {                       // blend back toward the untouched pixels
    const after = ctx.getImageData(0, 0, w, h), a = after.data, b = before.data;
    for (let i = 0; i < a.length; i += 4)
      for (let c = 0; c < 3; c++) a[i+c] = clamp(b[i+c] + (a[i+c] - b[i+c]) * strength);
    ctx.putImageData(after, 0, 0);
  }
  return { w, h };
}

const ALL = () => SKINS.map(s => ({ name: s[0], fn: s[1], cut: false }))
  .concat(mask ? CUTS.map(s => ({ name: s[0], fn: s[1], cut: true })) : []);

function render() {
  const grid = $('#grid');
  grid.innerHTML = '';
  const t0 = performance.now();
  ALL().forEach(entry => {
    const fig = document.createElement('figure');
    const cv = document.createElement('canvas');
    const cap = document.createElement('figcaption');
    cap.textContent = entry.name + (entry.cut ? ' ·' : '');
    fig.append(cv, cap); grid.append(fig);
    draw(entry, cv, sourceImg, 420);
    cv.onclick = () => openBig(entry);
  });
  $('#stat').textContent = ALL().length + ' looks in ' + Math.round(performance.now() - t0) +
    ' ms, 0 generations' + (mask ? ', cutout on' : '');
}

const SIZES = { native: null, 'post 4:5': [1080,1350], 'story 9:16': [1080,1920], 'square': [1080,1080] };
function exportCanvas(entry) {
  const cv = document.createElement('canvas');
  draw(entry, cv, sourceImg, 2400);
  const t = SIZES[exportSize];
  if (!t) return cv;
  const out = document.createElement('canvas'); out.width = t[0]; out.height = t[1];
  const c = out.getContext('2d');
  const sc = Math.max(t[0] / cv.width, t[1] / cv.height);
  const w = cv.width * sc, h = cv.height * sc;
  c.drawImage(cv, (t[0] - w) / 2, (t[1] - h) / 2, w, h);   // cover-crop, never squash
  return out;
}
function openBig(entry) {
  const cv = exportCanvas(entry);
  $('#big').src = cv.toDataURL('image/png');
  $('#bigcap').textContent = entry.name + ' · ' + cv.width + '×' + cv.height +
    (stackWith ? ' · over ' + stackWith.name : '') +
    (strength < 1 ? ' · ' + Math.round(strength * 100) + '%' : '');
  $('#dl').onclick = () => {
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = entry.name.toLowerCase().replace(/\s+/g, '-') + '.png';
    a.click();
  };
  $('#view').style.display = 'flex';
}

// --- cutout model -----------------------------------------------------------------------------
async function computeMask() {
  const btn = $('#cut');
  btn.disabled = true; btn.textContent = 'Loading model…';
  try {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
    ort.env.wasm.numThreads = 1;   // GitHub Pages cannot send COOP/COEP, so threads are unavailable
    const sess = await ort.InferenceSession.create('./u2netp.onnx', { executionProviders: ['wasm'] });
    btn.textContent = 'Finding the subject…';
    await new Promise(r => setTimeout(r, 20));
    const N = 320;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(sourceImg, 0, 0, N, N);
    const d = cx.getImageData(0, 0, N, N).data;
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    const f = new Float32Array(3 * N * N);
    for (let p = 0; p < N * N; p++) for (let ch = 0; ch < 3; ch++)
      f[ch * N * N + p] = ((d[p * 4 + ch] / 255) - mean[ch]) / std[ch];
    const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, N, N]) });
    const m = out[sess.outputNames[0]].data;
    let lo = Infinity, hi = -Infinity;
    for (const v of m) { if (v < lo) lo = v; if (v > hi) hi = v; }
    mask = new Float32Array(m.length);
    for (let i = 0; i < m.length; i++) mask[i] = (m[i] - lo) / (hi - lo);
    let on = 0; for (const v of mask) if (v > 0.5) on++;
    window.__maskCoverage = 100 * on / mask.length;
    btn.textContent = 'Cutout on · subject is ' + window.__maskCoverage.toFixed(1) + '% of frame';
    render();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Cutout failed — tap to retry';
    $('#stat').textContent = 'cutout error: ' + e;
  }
}

// --- wiring -----------------------------------------------------------------------------------
function buildStackMenu() {
  const sel = $('#stack');
  sel.innerHTML = '<option value="">Stack under: none</option>';
  ALL().forEach((e, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = 'Stack under: ' + e.name;
    sel.append(o);
  });
}
function boot(img) {
  sourceImg = img; mask = null; stackWith = null;
  $('#drop').style.display = 'none';
  $('#bar').style.display = 'flex';
  $('#cut').disabled = false;
  $('#cut').textContent = 'Turn on cutout looks (one ~10s pass)';
  buildStackMenu();
  render();
}
function load(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const img = new Image();
  img.onload = () => boot(img);
  img.src = URL.createObjectURL(file);
}

addEventListener('DOMContentLoaded', () => {
  const drop = $('#drop'), input = drop.querySelector('input');
  input.onchange = e => load(e.target.files[0]);
  ['dragenter', 'dragover'].forEach(k => drop.addEventListener(k, e => {
    e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(k => drop.addEventListener(k, e => {
    e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => load(e.dataTransfer.files[0]));
  addEventListener('paste', e => {
    const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (it) load(it.getAsFile());
  });
  $('#strength').oninput = e => {
    strength = e.target.value / 100;
    $('#slabel').textContent = e.target.value + '%';
    render();
  };
  $('#stack').onchange = e => { stackWith = e.target.value === '' ? null : ALL()[+e.target.value]; render(); };
  $('#size').onchange = e => { exportSize = e.target.value; };
  $('#cut').onclick = computeMask;
  $('#close').onclick = () => $('#view').style.display = 'none';
  $('#again').onclick = () => {
    $('#drop').style.display = ''; $('#bar').style.display = 'none';
    $('#grid').innerHTML = ''; mask = null;
  };
  Object.keys(SIZES).forEach(k => {
    const o = document.createElement('option'); o.value = k; o.textContent = 'Export: ' + k;
    $('#size').append(o);
  });
});

// handles for the test harness
window.__skinCount = SKINS.length;
window.__cutCount = CUTS.length;
window.__all = ALL;
window.__setStrength = v => { strength = v; render(); };
window.__setStack = i => { stackWith = i === null ? null : ALL()[i]; render(); };
window.__setSize = s => { exportSize = s; };
window.__exportCanvas = exportCanvas;
window.__computeMask = computeMask;
window.__srcImg = () => sourceImg;
