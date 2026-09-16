/** Enrutador mínimo basado en el hash de la URL. */

const listeners = new Set();
let depth = 0;

export function parseHash(hash = location.hash) {
  const raw = (hash || '').replace(/^#/, '') || '/inicio';
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { path: `/${segments.join('/')}`, segments, query, raw };
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (replace) {
    history.replaceState(history.state, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    depth += 1;
    location.hash = target;
  }
}

export function goBack(fallback = '/inicio') {
  if (depth > 0 && history.length > 1) {
    depth -= 1;
    history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startRouter() {
  const fire = () => listeners.forEach((fn) => fn(parseHash()));
  window.addEventListener('hashchange', fire);
  fire();
}
