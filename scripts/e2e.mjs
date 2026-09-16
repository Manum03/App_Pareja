/**
 * Prueba de extremo a extremo de la app (Playwright + Chromium).
 *
 *   npm install          # solo para las pruebas: la app no necesita dependencias
 *   npm test
 *
 * Levanta un servidor estático, simula un móvil y recorre el flujo completo:
 * escanear un dibujo, guardarlo, buscarlo, fechas, planes, copia de seguridad,
 * restauración, edición, borrado, bloqueo por código y uso sin conexión.
 * Las capturas quedan en .e2e-output/.
 */

import { chromium, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.e2e-output');
const PORT = Number(process.env.PORT || 8123);
const BASE = `http://127.0.0.1:${PORT}/index.html`;

fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------ servidor -------------------------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ics': 'text/calendar',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? '/index.html' : url;
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no encontrado'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

/* --------------- foto de prueba: un dibujo sobre papel torcido ------------ */

function testPhoto() {
  const W = 900; const H = 1200;
  const quad = [[120, 180], [760, 90], [830, 1010], [190, 1120]];
  const inside = (px, py) => {
    let sign = null;
    for (let i = 0; i < 4; i += 1) {
      const [x1, y1] = quad[i];
      const [x2, y2] = quad[(i + 1) % 4];
      const s = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1) > 0;
      if (sign === null) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  };
  const uv = (px, py) => {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
    let u = 0.5; let v = 0.5;
    for (let i = 0; i < 12; i += 1) {
      const topX = x0 + (x1 - x0) * u; const topY = y0 + (y1 - y0) * u;
      const botX = x3 + (x2 - x3) * u; const botY = y3 + (y2 - y3) * u;
      const curX = topX + (botX - topX) * v; const curY = topY + (botY - topY) * v;
      const duX = (x1 - x0) * (1 - v) + (x2 - x3) * v;
      const duY = (y1 - y0) * (1 - v) + (y2 - y3) * v;
      const dvX = botX - topX; const dvY = botY - topY;
      const det = duX * dvY - duY * dvX;
      if (Math.abs(det) < 1e-6) break;
      const dx = px - curX; const dy = py - curY;
      u = Math.min(1, Math.max(0, u + (dx * dvY - dy * dvX) / det));
      v = Math.min(1, Math.max(0, v + (duX * dy - duY * dx) / det));
    }
    return [u, v];
  };
  const heart = (u, v) => {
    const x = (u - 0.5) * 2.6;
    const y = -((v - 0.42) * 2.6);
    return (x * x + y * y - 1) ** 3 - x * x * y * y * y <= 0;
  };
  const raw = Buffer.alloc((W * 4 + 1) * H);
  let o = 0;
  for (let py = 0; py < H; py += 1) {
    raw[o] = 0; o += 1;
    for (let px = 0; px < W; px += 1) {
      const t = (px * 0.6 + py * 0.4) / (W + H);
      let r = 120 + 40 * t; let g = 92 + 30 * t; let b = 70 + 22 * t;
      if (inside(px, py)) {
        const [u, v] = uv(px, py);
        const shade = 1 - 0.34 * (u * 0.7 + v * 0.5);
        r = 236 * shade; g = 236 * shade; b = 233 * shade;
        if (heart(u, v)) { r = 60 * shade; g = 30 * shade; b = 45 * shade; }
        if ((v > 0.78 && v < 0.80 && u > 0.2 && u < 0.7)
          || (v > 0.84 && v < 0.855 && u > 0.2 && u < 0.5)) {
          r = 50 * shade; g = 50 * shade; b = 90 * shade;
        }
      }
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
      o += 4;
    }
  }
  const crc32 = (buf) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i += 1) {
      c ^= buf[i];
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (tag, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(tag), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const photo = testPhoto();
fs.writeFileSync(path.join(OUT, 'dibujo.png'), photo);

/* -------------------------------- pruebas -------------------------------- */

const problems = [];
const log = (...a) => console.log('  ✓', ...a);
const check = (label, ok, extra = '') => {
  if (ok) log(label, extra);
  else { problems.push(label); console.log('  ✗', label, extra); }
};

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['iPhone 13'], isMobile: true, hasTouch: true, locale: 'es-ES', acceptDownloads: true,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

console.log('\n1) Escanear y guardar un recuerdo');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');
await shot('01-inicio');

const chooser = page.waitForEvent('filechooser');
await page.click('.btn-primary:has-text("Escanear")');
await (await chooser).setFiles({ name: 'dibujo.png', mimeType: 'image/png', buffer: photo });
await page.waitForSelector('.scanner canvas');
await page.waitForTimeout(400);

const box = await page.locator('.scanner canvas').boundingBox();
const scale = box.width / 900;
const from = [[54, 72], [846, 72], [846, 1128], [54, 1128]];
const to = [[120, 180], [760, 90], [830, 1010], [190, 1120]];
for (let i = 0; i < 4; i += 1) {
  const a = { x: box.x + from[i][0] * scale, y: box.y + from[i][1] * scale };
  const b = { x: box.x + to[i][0] * scale, y: box.y + to[i][1] * scale };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}
await shot('02-esquinas');
await page.click('button:text-is("Recortar")');
await page.waitForSelector('button:text-is("Usar foto")');
await page.waitForTimeout(600);
await shot('03-acabado');
await page.click('button:text-is("Usar foto")');
await page.waitForSelector('.scanner', { state: 'detached' });

await page.waitForSelector('.photo-thumb img');
const recorte = await page.evaluate(async () => {
  const leer = async () => {
    const dbReq = indexedDB.open('nuestros-momentos');
    const db = await new Promise((r) => { dbReq.onsuccess = () => r(dbReq.result); });
    const all = await new Promise((r) => {
      const q = db.transaction('images').objectStore('images').getAll();
      q.onsuccess = () => r(q.result);
    });
    db.close();
    return all;
  };
  for (let i = 0; i < 20; i += 1) {
    const all = await leer();
    if (all.length) return { w: all[0].w, h: all[0].h };
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
});
check('la foto se recorta y endereza', !!recorte && recorte.w < 800 && recorte.h < 1000,
  recorte ? `${recorte.w}×${recorte.h}px` : 'sin imagen');

await page.fill('input[placeholder*="título"]', 'Dibujo del corazón');
await page.fill('input[type="date"]', '2026-02-14');
await page.fill('textarea', 'Me lo hizo en San Valentín.');
await page.fill('input[placeholder*="etiqueta"]', 'sanvalentin');
await page.keyboard.press('Enter');
await page.click('button:has-text("Guardar recuerdo")');
await page.waitForTimeout(600);
check('el recuerdo se guarda', (await page.textContent('#viewTitle')) === 'Dibujo del corazón');
await shot('04-detalle');

console.log('\n2) Galería, búsqueda y línea de tiempo');
await page.click('.tab[data-tab="recuerdos"]');
await page.waitForTimeout(400);
await page.fill('input[type="search"]', 'corazón');
await page.waitForTimeout(400);
check('la búsqueda encuentra el recuerdo', (await page.locator('.tile').count()) === 1);
await page.fill('input[type="search"]', 'zzz');
await page.waitForTimeout(400);
check('una búsqueda sin resultados muestra el aviso', (await page.locator('.empty').count()) === 1);
await page.fill('input[type="search"]', '');
await page.waitForTimeout(300);
await page.click('button:has-text("Línea de tiempo")');
await page.waitForTimeout(300);
check('la línea de tiempo agrupa por mes', (await page.locator('.tl-group').count()) >= 1);
await shot('05-linea-tiempo');

console.log('\n3) Fechas importantes');
await page.click('.tab[data-tab="fechas"]');
await page.waitForTimeout(300);
await page.click('button:has-text("Poner la fecha")');
await page.waitForSelector('.sheet input[type="date"]');
await page.fill('.sheet input[type="date"]', '2021-06-05');
await page.click('.sheet button:has-text("Guardar")');
await page.waitForTimeout(400);
await page.click('button:has-text("Añadir fecha importante")');
await page.waitForSelector('.sheet');
await page.fill('.sheet input[placeholder*="aniversario"]', 'Su cumpleaños');
await page.fill('.sheet input[type="date"]', '1999-10-02');
await page.click('.sheet button[type="submit"]');
await page.waitForTimeout(500);
check('cuenta los días juntos', /\d+ días/.test(await page.textContent('.hero')));
check('la fecha aparece en la lista', (await page.locator('.list-item:has-text("Su cumpleaños")').count()) >= 1);
await shot('06-fechas');

const ics = page.waitForEvent('download');
await page.click('button:has-text("Al calendario")');
const icsFile = await (await ics).path();
const icsText = fs.readFileSync(icsFile, 'utf8');
check('exporta un .ics válido', icsText.includes('BEGIN:VEVENT') && icsText.includes('RRULE:FREQ=YEARLY'));

console.log('\n4) Planes');
await page.click('.tab[data-tab="planes"]');
await page.waitForTimeout(300);
await page.click('button:has-text("Nuevo plan")');
await page.waitForSelector('.sheet');
await page.fill('.sheet input[placeholder*="Cena"]', 'Escapada a la playa');
await page.fill('.sheet input[type="date"]', '2026-10-11');
await page.click('.sheet button[type="submit"]');
await page.waitForTimeout(500);
check('el plan queda guardado', (await page.locator('.list-item:has-text("Escapada")').count()) === 1);
await shot('07-planes');

console.log('\n5) Copia de seguridad y restauración');
await page.goto(`${BASE}#/ajustes`);
await page.waitForTimeout(400);
const dl = page.waitForEvent('download');
await page.click('button:has-text("Exportar todo")');
const backupPath = path.join(OUT, 'copia.json');
await (await dl).saveAs(backupPath);
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
check('la copia incluye datos y fotos',
  backup.memories.length === 1 && backup.images.length === 1 && backup.dates.length === 1,
  `${(fs.statSync(backupPath).size / 1024).toFixed(0)} KB`);

await page.evaluate(async () => { (await import('./js/store.js')).wipeEverything(); });
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');
await page.goto(`${BASE}#/ajustes`);
await page.waitForTimeout(400);
await page.setInputFiles('input[type=file][accept*=json]', backupPath);
await page.waitForSelector('.sheet');
await page.click('.sheet button:has-text("Añadir lo que falte")');
await page.waitForTimeout(1800);
await page.waitForSelector('#app:not([hidden])');
const restored = await page.evaluate(async () => {
  const s = await import('./js/store.js');
  return [s.state.memories.length, s.state.dates.length, s.state.activities.length, await s.db.count('images')];
});
check('la restauración devuelve todo', restored.join('/') === '1/1/1/1', restored.join('/'));

console.log('\n6) Editar, borrar y bloqueo');
await page.goto(`${BASE}#/recuerdos`);
await page.waitForTimeout(500);
await page.click('.tile >> nth=0');
await page.waitForTimeout(400);
await page.click('.icon-btn[aria-label="Más opciones"]');
await page.click('.sheet-menu button:has-text("Editar")');
await page.waitForTimeout(400);
await page.fill('input[placeholder*="título"]', 'Título editado');
await page.click('button:has-text("Guardar recuerdo")');
await page.waitForTimeout(600);
check('se puede editar un recuerdo', (await page.textContent('#viewTitle')) === 'Título editado');

await page.click('.icon-btn[aria-label="Más opciones"]');
await page.click('.sheet-menu button:has-text("Eliminar")');
await page.waitForSelector('.sheet .btn-danger');
await page.click('.sheet .btn-danger');
await page.waitForTimeout(800);
const quedan = await page.evaluate(async () => (await import('./js/store.js')).state.memories.length);
check('se puede borrar un recuerdo', quedan === 0);

await page.goto(`${BASE}#/ajustes`);
await page.waitForTimeout(400);
await page.click('.card:has-text("Privacidad") .switch');
await page.waitForSelector('.sheet input[type=password]');
await page.fill('.sheet input[type=password]', '2468');
await page.click('.sheet button:has-text("Activar")');
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#lock:not([hidden])');
await page.fill('#lockInput', '1111');
await page.click('#lockBtn');
await page.waitForTimeout(300);
check('rechaza un código incorrecto', (await page.textContent('#lockError')) === 'Código incorrecto');
await page.fill('#lockInput', '2468');
await page.click('#lockBtn');
await page.waitForTimeout(400);
check('entra con el código correcto', !(await page.locator('#lock').isVisible()));
await page.click('.tab[data-tab="planes"]');
await page.waitForTimeout(400);
check('se puede navegar tras desbloquear', (await page.textContent('#viewTitle')) === 'Planes');

console.log('\n7) Sin conexión');
const swReady = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true).catch(() => false));
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#lock:not([hidden]), #app:not([hidden])', { timeout: 10000 });
check('la app abre sin conexión', swReady);
await context.setOffline(false);

await browser.close();
server.close();

console.log(`\nErrores de consola: ${consoleErrors.length ? consoleErrors.join(' | ') : 'ninguno'}`);
console.log(`Capturas en ${path.relative(ROOT, OUT)}/`);
if (problems.length || consoleErrors.length) {
  console.error(`\nFALLOS: ${problems.length + consoleErrors.length}`);
  process.exit(1);
}
console.log('\nTodo correcto ✔');
