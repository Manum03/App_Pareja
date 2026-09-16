/** Ajustes: nombres, fecha de inicio, apariencia, bloqueo y copias de seguridad. */

import {
  el, toast, openSheet, confirmDialog, promptDialog, formatBytes, isValidISODate, debounce,
} from '../util.js';
import { state, saveSettings, orphanImageIds, wipeEverything, db, stats } from '../store.js';
import { setPin } from '../lock.js';
import { exportBackup, readBackupFile, importBackup, describeBackup } from '../backup.js';
import { FILTERS } from '../images.js';
import { exportCalendar } from './dates.js';
import { applyTheme } from '../theme.js';

export async function render() {
  const wrap = el('div');
  const s = stats();

  /* ------------------------------ nosotros ------------------------------- */
  const myName = el('input', {
    class: 'input', type: 'text', value: state.settings.myName || '', maxlength: '40',
    placeholder: 'Tu nombre',
    oninput: debounce((ev) => saveSettings({ myName: ev.target.value.trim() }), 500),
  });
  const partnerName = el('input', {
    class: 'input', type: 'text', value: state.settings.partnerName || '', maxlength: '40',
    placeholder: 'El nombre de tu pareja',
    oninput: debounce((ev) => saveSettings({ partnerName: ev.target.value.trim() }), 500),
  });
  const startDate = el('input', {
    class: 'input', type: 'date', value: state.settings.startDate || '',
    onchange: (ev) => {
      const v = ev.target.value;
      if (v && !isValidISODate(v)) { toast('Revisa la fecha'); return; }
      saveSettings({ startDate: v });
      toast('Guardado');
    },
  });

  wrap.append(el('div', { class: 'card' }, [
    el('h2', { text: 'Nosotros' }),
    el('div', { class: 'field', style: 'margin-top:12px' }, [el('label', { text: 'Tu nombre' }), myName]),
    el('div', { class: 'field' }, [el('label', { text: 'Su nombre' }), partnerName]),
    el('div', { class: 'field', style: 'margin-bottom:0' }, [
      el('label', { text: 'Desde cuándo estáis juntos' }), startDate,
    ]),
  ]));

  /* ----------------------------- apariencia ------------------------------ */
  const themeSelect = el('select', {
    class: 'select',
    onchange: async (ev) => {
      await saveSettings({ theme: ev.target.value });
      applyTheme(ev.target.value);
    },
  }, [
    el('option', { value: 'auto', text: 'Automático (como el teléfono)' }),
    el('option', { value: 'light', text: 'Claro' }),
    el('option', { value: 'dark', text: 'Oscuro' }),
  ]);
  themeSelect.value = state.settings.theme || 'auto';

  const filterSelect = el('select', {
    class: 'select',
    onchange: (ev) => { saveSettings({ defaultFilter: ev.target.value }); toast('Guardado'); },
  }, FILTERS.map((f) => el('option', { value: f.id, text: f.label })));
  filterSelect.value = state.settings.defaultFilter || 'escaneo';

  wrap.append(el('div', { class: 'card' }, [
    el('h2', { text: 'Apariencia y escáner' }),
    el('div', { class: 'field', style: 'margin-top:12px' }, [el('label', { text: 'Tema' }), themeSelect]),
    el('div', { class: 'field', style: 'margin-bottom:0' }, [
      el('label', { text: 'Acabado por defecto al escanear' }), filterSelect,
    ]),
  ]));

  /* ----------------------------- privacidad ------------------------------ */
  const lockSwitch = el('input', { type: 'checkbox' });
  lockSwitch.checked = !!state.settings.lockEnabled;
  lockSwitch.addEventListener('change', async () => {
    if (lockSwitch.checked) {
      const pin = await promptDialog({
        title: 'Elige un código',
        message: 'De 4 a 12 cifras. Lo pedirá al abrir la app.',
        type: 'password', confirmText: 'Activar',
      });
      if (!pin || pin.length < 4) {
        lockSwitch.checked = false;
        if (pin !== undefined) toast('El código necesita al menos 4 cifras');
        return;
      }
      await setPin(pin);
      toast('Bloqueo activado');
    } else {
      await setPin('');
      toast('Bloqueo desactivado');
    }
  });

  wrap.append(el('div', { class: 'card' }, [
    el('h2', { text: 'Privacidad' }),
    el('label', { class: 'switch-row' }, [
      el('div', { class: 'sr-body' }, [
        el('b', { text: 'Pedir código al abrir' }),
        el('span', { text: 'Una barrera sencilla si alguien coge tu móvil' }),
      ]),
      el('span', { class: 'switch' }, [lockSwitch, el('i')]),
    ]),
    el('p', { class: 'small muted', style: 'margin:10px 0 0' }, [
      'Todo se guarda solo en este teléfono: no hay servidor, ni cuenta, ni nadie más que pueda verlo. '
      + 'Por eso conviene hacer copias de seguridad de vez en cuando.',
    ]),
  ]));

  /* --------------------------- copia de seguridad ------------------------ */
  const progress = el('div', { class: 'progress', hidden: true }, [el('i', { style: 'width:0%' })]);

  async function doExport(includePhotos) {
    progress.hidden = false;
    const bar = progress.firstChild;
    bar.style.width = '4%';
    try {
      const result = await exportBackup({
        includePhotos,
        onProgress: (done, total) => { bar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`; },
      });
      toast(`Copia creada (${formatBytes(result.size)})`);
    } catch (err) {
      console.error(err);
      toast('No se pudo crear la copia');
    } finally {
      setTimeout(() => { progress.hidden = true; bar.style.width = '0%'; }, 600);
    }
  }

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const data = await readBackupFile(file);
      const info = describeBackup(data);
      const mode = await openSheet((close) => el('div', {}, [
        el('h3', { text: 'Restaurar copia' }),
        el('p', { class: 'muted small' }, [
          `Copia del ${info.date}: ${info.memories} recuerdos, ${info.photos} fotos, `
          + `${info.dates} fechas y ${info.activities} planes.`,
        ]),
        el('div', { class: 'sheet-menu', style: 'margin-top:8px' }, [
          el('button', { type: 'button', onclick: () => close('merge') },
            ['➕  Añadir lo que falte (recomendado)']),
          el('button', { type: 'button', class: 'danger', onclick: () => close('replace') },
            ['♻️  Reemplazar todo lo que hay ahora']),
        ]),
      ]));
      if (!mode) return;
      if (mode === 'replace') {
        const ok = await confirmDialog({
          title: '¿Reemplazar todo?',
          message: 'Se borrarán los recuerdos actuales de este teléfono antes de restaurar.',
          confirmText: 'Reemplazar', danger: true,
        });
        if (!ok) return;
      }
      const result = await importBackup(data, mode);
      toast(`Restaurado: ${result.memories} recuerdos, ${result.dates} fechas, ${result.activities} planes`);
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      console.error(err);
      toast(err.message || 'No se pudo leer el archivo');
    }
  });

  wrap.append(el('div', { class: 'card' }, [
    el('h2', { text: 'Copia de seguridad' }),
    el('p', { class: 'small muted', style: 'margin-top:6px' }, [
      'Guarda el archivo en Google Drive, iCloud o envíatelo por correo. '
      + 'Sirve para pasar todo a otro teléfono.',
    ]),
    progress,
    el('div', { class: 'row row-wrap', style: 'margin-top:12px;gap:8px' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button', style: 'flex:1 1 100%',
        text: '⬇️ Exportar todo (con fotos)', onclick: () => doExport(true),
      }),
      el('button', {
        class: 'btn btn-ghost', type: 'button', style: 'flex:1 1 46%',
        text: 'Solo textos', onclick: () => doExport(false),
      }),
      el('button', {
        class: 'btn btn-ghost', type: 'button', style: 'flex:1 1 46%',
        text: '⬆️ Restaurar', onclick: () => fileInput.click(),
      }),
      fileInput,
    ]),
    el('button', {
      class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:8px',
      text: '📅 Exportar fechas al calendario', onclick: exportCalendar,
    }),
  ]));

  /* --------------------------- almacenamiento ---------------------------- */
  const usageLine = el('p', { class: 'small muted', style: 'margin:6px 0 0', text: 'Calculando espacio…' });
  db.estimateUsage().then((info) => {
    usageLine.textContent = info
      ? `${s.photos} fotos · ${formatBytes(info.usage)} usados de ${formatBytes(info.quota)} disponibles`
      : `${s.photos} fotos guardadas en este teléfono`;
  });

  wrap.append(el('div', { class: 'card' }, [
    el('h2', { text: 'Almacenamiento' }),
    usageLine,
    el('button', {
      class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:12px',
      text: '🧹 Limpiar fotos sueltas',
      onclick: async () => {
        const ids = await orphanImageIds();
        if (!ids.length) { toast('No hay nada que limpiar'); return; }
        const ok = await confirmDialog({
          title: `¿Borrar ${ids.length} fotos sueltas?`,
          message: 'Son fotos que no pertenecen a ningún recuerdo (por ejemplo, de algo que empezaste y no guardaste).',
          confirmText: 'Borrar', danger: true,
        });
        if (!ok) return;
        await db.removeMany(db.STORES.images, ids);
        toast('Limpieza hecha');
      },
    }),
    el('button', {
      class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:8px',
      text: '🗑️ Borrar todo',
      onclick: async () => {
        const ok = await confirmDialog({
          title: '¿Borrar todos los recuerdos?',
          message: 'Se borrará absolutamente todo de este teléfono. Si no tienes una copia, no hay vuelta atrás.',
          confirmText: 'Borrar todo', danger: true,
        });
        if (!ok) return;
        const typed = await promptDialog({
          title: 'Confirma escribiendo BORRAR',
          placeholder: 'BORRAR', confirmText: 'Confirmar',
        });
        if ((typed || '').toUpperCase() !== 'BORRAR') { toast('Cancelado'); return; }
        await wipeEverything();
        toast('Todo borrado');
        setTimeout(() => location.reload(), 800);
      },
    }),
  ]));

  /* ------------------------------- ayuda --------------------------------- */
  wrap.append(el('div', { class: 'card' }, [
    el('h2', { text: 'Cómo instalarla en el móvil' }),
    el('p', { class: 'small muted', style: 'margin-top:8px' }, [
      'Android (Chrome): menú ⋮ → «Añadir a pantalla de inicio». '
      + 'iPhone (Safari): botón compartir → «Añadir a pantalla de inicio». '
      + 'Así se abre a pantalla completa y funciona sin conexión.',
    ]),
    el('p', { class: 'small muted', style: 'margin:0', text: `Versión ${window.APP_VERSION || '1.0.0'}` }),
  ]));

  return { title: 'Ajustes', subtitle: 'Tu app, a tu manera', content: wrap, tab: '' };
}
