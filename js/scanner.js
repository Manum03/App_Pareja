/**
 * Escáner de dibujos y cartas: recorta con corrección de perspectiva
 * (arrastrando las cuatro esquinas) y aplica un acabado tipo escáner.
 */

import { el } from './util.js';
import {
  FILTERS, applyFilter, loadBitmap, rotateCanvas, toCanvas, warpQuad, MAX_DIM,
} from './images.js';

const HANDLE_HIT = 34;      // radio de captura del dedo, en píxeles de pantalla
const PREVIEW_MAX = 1000;   // resolución de las vistas previas

/**
 * Abre el escáner con la foto indicada.
 * @param {File|Blob} file
 * @param {{ defaultFilter?: string, skipCrop?: boolean }} options
 * @returns {Promise<HTMLCanvasElement|null>} canvas final o null si se cancela
 */
export async function openScanner(file, { defaultFilter = 'escaneo', skipCrop = false } = {}) {
  const bitmap = await loadBitmap(file);
  let source = toCanvas(bitmap, MAX_DIM);

  return new Promise((resolve) => {
    let step = skipCrop ? 'filter' : 'crop';
    let filterId = defaultFilter;
    let quad = defaultQuad(source);
    let cropped = null;          // canvas recortado a resolución completa
    let previewBase = null;      // versión reducida para previsualizar filtros
    let busy = false;

    const stage = el('div', { class: 'scanner-stage' });
    const canvas = el('canvas');
    stage.append(canvas);

    const title = el('b', { text: 'Ajusta las esquinas' });
    const cancelBtn = el('button', { type: 'button', text: 'Cancelar', onclick: () => finish(null) });
    const rotateBtn = el('button', { type: 'button', text: '↻ Girar', onclick: () => rotate() });
    const head = el('div', { class: 'scanner-head' }, [cancelBtn, el('div', { class: 'spacer' }), title, el('div', { class: 'spacer' }), rotateBtn]);

    const tip = el('p', { class: 'scanner-tip' });
    const filterBar = el('div', { class: 'scanner-filters' });
    const primaryBtn = el('button', { class: 'btn btn-primary', type: 'button' });
    const secondaryBtn = el('button', { class: 'btn btn-ghost', type: 'button' });
    const foot = el('div', { class: 'scanner-foot' }, [
      filterBar, tip,
      el('div', { class: 'scanner-row' }, [secondaryBtn, primaryBtn]),
    ]);

    const root = el('div', { class: 'scanner', role: 'dialog', 'aria-modal': 'true' }, [head, stage, foot]);
    document.body.append(root);
    document.body.style.overflow = 'hidden';

    FILTERS.forEach((f) => {
      filterBar.append(el('button', {
        type: 'button',
        text: f.label,
        'aria-pressed': String(f.id === filterId),
        onclick: () => {
          filterId = f.id;
          [...filterBar.children].forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === f.label)));
          renderFilterPreview();
        },
      }));
    });

    function finish(result) {
      root.remove();
      document.body.style.overflow = '';
      window.removeEventListener('resize', draw);
      resolve(result);
    }

    function rotate() {
      if (step === 'crop') {
        source = rotateCanvas(source, 1);
        quad = defaultQuad(source);
        draw();
      } else {
        cropped = rotateCanvas(cropped, 1);
        previewBase = fit(cropped, PREVIEW_MAX);
        renderFilterPreview();
      }
    }

    /* ----------------------------- paso 1: recorte ----------------------------- */

    function displayMetrics() {
      const box = stage.getBoundingClientRect();
      const src = step === 'crop' ? source : cropped;
      const scale = Math.min((box.width - 16) / src.width, (box.height - 16) / src.height, 1);
      return { scale, w: Math.round(src.width * scale), h: Math.round(src.height * scale) };
    }

    function draw() {
      if (step !== 'crop') { renderFilterPreview(); return; }
      const { scale, w, h } = displayMetrics();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(source, 0, 0, w, h);

      const pts = quad.map((p) => ({ x: p.x * scale, y: p.y * scale }));

      // oscurecemos lo que queda fuera del cuadrilátero
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = pts.length - 1; i >= 1; i -= 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(8, 6, 12, .55)';
      ctx.fill('evenodd');
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.strokeStyle = '#ff8fa8';
      ctx.lineWidth = 2;
      ctx.stroke();

      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.strokeStyle = '#c9184a';
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    }

    let dragIndex = -1;
    canvas.addEventListener('pointerdown', (ev) => {
      if (step !== 'crop') return;
      const { scale } = displayMetrics();
      const rect = canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / scale;
      const y = (ev.clientY - rect.top) / scale;
      let best = -1;
      let bestDist = HANDLE_HIT / scale;
      quad.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      if (best >= 0) {
        dragIndex = best;
        canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      }
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (dragIndex < 0) return;
      const { scale } = displayMetrics();
      const rect = canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / scale;
      const y = (ev.clientY - rect.top) / scale;
      quad[dragIndex] = {
        x: Math.min(source.width, Math.max(0, x)),
        y: Math.min(source.height, Math.max(0, y)),
      };
      draw();
      ev.preventDefault();
    });
    const endDrag = () => { dragIndex = -1; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    /* ---------------------------- paso 2: acabado ----------------------------- */

    function renderFilterPreview() {
      if (step !== 'filter' || !previewBase) return;
      const out = applyFilter(previewBase, filterId);
      const { w, h } = displayMetrics();
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, out.width, out.height);
      ctx.drawImage(out, 0, 0);
    }

    function fit(src, maxDim) {
      const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
      if (scale === 1) return src;
      const out = document.createElement('canvas');
      out.width = Math.round(src.width * scale);
      out.height = Math.round(src.height * scale);
      const ctx = out.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, out.width, out.height);
      return out;
    }

    async function goToFilterStep({ useFullImage = false } = {}) {
      busy = true;
      primaryBtn.disabled = true;
      primaryBtn.textContent = 'Procesando…';
      await new Promise((r) => setTimeout(r, 16));
      cropped = useFullImage ? source : warpQuad(source, quad, MAX_DIM);
      previewBase = fit(cropped, PREVIEW_MAX);
      step = 'filter';
      busy = false;
      syncUI();
      renderFilterPreview();
    }

    async function done() {
      if (busy) return;
      busy = true;
      primaryBtn.disabled = true;
      primaryBtn.textContent = 'Guardando…';
      await new Promise((r) => setTimeout(r, 16));
      const result = applyFilter(cropped, filterId);
      finish(result);
    }

    function syncUI() {
      const crop = step === 'crop';
      title.textContent = crop ? 'Ajusta las esquinas' : 'Elige el acabado';
      filterBar.hidden = crop;
      tip.textContent = crop
        ? 'Arrastra las esquinas hasta los bordes del papel'
        : 'El acabado «Escaneo» aclara el papel y realza los trazos';
      primaryBtn.disabled = false;
      primaryBtn.textContent = crop ? 'Recortar' : 'Usar foto';
      secondaryBtn.textContent = crop ? 'Sin recortar' : 'Atrás';
      primaryBtn.onclick = crop ? () => goToFilterStep() : done;
      secondaryBtn.onclick = crop
        ? () => goToFilterStep({ useFullImage: true })
        : () => { step = 'crop'; syncUI(); draw(); };
      rotateBtn.hidden = false;
    }

    window.addEventListener('resize', draw);
    syncUI();
    if (skipCrop) goToFilterStep({ useFullImage: true });
    else requestAnimationFrame(draw);
  });
}

function defaultQuad(canvas) {
  const mx = canvas.width * 0.06;
  const my = canvas.height * 0.06;
  return [
    { x: mx, y: my },
    { x: canvas.width - mx, y: my },
    { x: canvas.width - mx, y: canvas.height - my },
    { x: mx, y: canvas.height - my },
  ];
}

/**
 * Abre el selector de archivos/cámara y devuelve los ficheros elegidos.
 * `capture` fuerza la cámara trasera en el móvil.
 */
export function pickImages({ capture = false, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = el('input', {
      type: 'file',
      accept: 'image/*',
      style: 'position:fixed;left:-9999px;opacity:0',
    });
    if (capture) input.setAttribute('capture', 'environment');
    if (multiple && !capture) input.multiple = true;
    document.body.append(input);
    let settled = false;
    const done = (files) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done([...(input.files || [])]));
    // Cancelación: los navegadores modernos avisan con «cancel»; en los demás
    // esperamos a que la página recupere el foco. El margen es amplio a
    // propósito: al volver de la cámara el archivo puede tardar en llegar.
    input.addEventListener('cancel', () => done([]));
    window.addEventListener('focus', () => setTimeout(() => {
      if (!input.files || !input.files.length) done([]);
    }, 2500), { once: true });
    input.click();
  });
}
