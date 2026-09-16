# 💗 Nuestros Momentos

Una app para el móvil donde guardar **los dibujos, las cartas, los regalos y los
momentos** que te da tu pareja, con la fecha en la que te los dio, además de
**las fechas importantes y los planes que hacéis juntos**.

Funciona **sin conexión**, **sin cuenta** y **sin servidor**: todo se guarda en
tu propio teléfono.

---

## Qué hace

**📷 Escanear dibujos y cartas**
Haces la foto desde la app, arrastras las cuatro esquinas del papel y la app lo
**endereza** (corrige la perspectiva, aunque hayas hecho la foto en ángulo) y lo
deja como una hoja limpia: quita las sombras y deja el papel blanco. Hay cuatro
acabados: original, escaneo, blanco y negro, y colores vivos.

**🎁 Guardar recuerdos**
Cada recuerdo tiene su tipo (dibujo, carta, regalo, detalle, foto o momento),
título, **la fecha en la que te lo dio**, la historia detrás, el lugar,
etiquetas y favoritos. Puedes poner varias fotos en el mismo recuerdo.

**🖼 Galería y línea de tiempo**
Todo se ve como galería de fotos o como línea de tiempo agrupada por meses, con
búsqueda por texto y filtros por tipo o favoritos.

**📅 Fechas importantes**
Aniversarios, cumpleaños y cualquier día que no quieras olvidar, con cuenta
atrás. Si guardas el día en que empezasteis, la app cuenta **los días que
lleváis juntos** y te avisa de los hitos (500 días, 1000 días, los años…).
Puedes exportar todas las fechas a un archivo `.ics` y añadirlas al calendario
del teléfono, con aviso el día antes.

**✨ Planes juntos**
Una lista de lo que queréis hacer y lo que ya habéis hecho, con fecha, lugar,
nota y puntuación. Al marcar un plan como hecho, la app te ofrece guardar una
foto de ese día como recuerdo.

**🔒 Privacidad**
Puedes poner un código para abrir la app. Vuelve a pedirlo si la dejas dos
minutos en segundo plano.

**💾 Copias de seguridad**
Exporta todo (fotos incluidas) a un único archivo `.json` que puedes guardar en
Drive, iCloud o enviarte por correo, y restaurarlo en otro teléfono.

---

## Cómo ponerla en tu móvil

La app es una **PWA**: una página web que se instala como una app normal. No
hace falta pasar por ninguna tienda de aplicaciones.

### Opción A — publicarla gratis con GitHub Pages (recomendada)

1. En GitHub, entra en **Settings → Pages** de este repositorio.
2. En **Build and deployment → Source**, elige **GitHub Actions**.
3. Cada vez que se suba algo a la rama `claude/couple-moments-gifts-app-7y8n3j`
   (o a `main`), el flujo de `.github/workflows/pages.yml` la publica sola.
4. GitHub te dará una dirección del tipo
   `https://manum03.github.io/App_Pareja/`.
5. Abre esa dirección **en el móvil** y añádela a la pantalla de inicio:
   - **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio*.
   - **iPhone (Safari):** botón compartir → *Añadir a pantalla de inicio*.

A partir de ahí se abre a pantalla completa, con su icono, y funciona sin
conexión.

> Si prefieres que nadie más pueda abrir la dirección, usa la opción B.

### Opción B — sin publicarla en internet

Copia la carpeta a cualquier hosting estático privado (Netlify, Vercel, tu
propio servidor) o ábrela desde un ordenador en la misma wifi:

```bash
npm start          # sirve la carpeta en http://localhost:8123
```

Luego abre `http://<ip-del-ordenador>:8123` desde el móvil.

> La cámara y el «añadir a pantalla de inicio» necesitan **https** (o
> `localhost`). GitHub Pages ya es https.

---

## Dónde se guardan los recuerdos

En el navegador del propio teléfono (IndexedDB), nada más. Nadie más los ve, ni
siquiera quien publica la app. Eso tiene una contrapartida importante:

- Si borras los datos del navegador o desinstalas la app, **se borran**.
- No se sincroniza entre dispositivos.

Por eso, **haz una copia de seguridad de vez en cuando** desde
*Ajustes → Copia de seguridad → Exportar todo* y guarda ese archivo en un sitio
seguro. Para pasarlo a otro móvil: instala la app allí, *Restaurar*, y elige el
archivo.

El código de acceso es una barrera para miradas curiosas, no cifrado: quien
tenga el teléfono desbloqueado y sepa buscar podría llegar a los datos.

---

## Cómo está hecha

HTML, CSS y JavaScript a pelo (módulos ES). **Sin framework y sin compilación**:
lo que hay en el repositorio es exactamente lo que se ejecuta.

```
index.html              estructura de la app
manifest.webmanifest    datos de instalación (nombre, iconos, color)
sw.js                   service worker: funciona sin conexión
css/styles.css          estilos, tema claro y oscuro
js/
  app.js                arranque, enrutado, bloqueo, actualizaciones
  router.js             enrutador por hash (#/recuerdos, #/fechas…)
  store.js              recuerdos, fechas, planes y ajustes
  db.js                 IndexedDB
  images.js             recorte con perspectiva, filtros, miniaturas
  scanner.js            pantalla del escáner (esquinas + acabados)
  agenda.js             próximas fechas e hitos automáticos
  calendar.js           exportación .ics
  backup.js             copias de seguridad
  lock.js               código de acceso
  ui.js / util.js       componentes y utilidades (fechas en español)
  views/                una pantalla por archivo
scripts/
  e2e.mjs               prueba de extremo a extremo (Playwright)
  make_icons.py         genera los iconos PNG
```

### Pruebas

```bash
npm install     # solo Playwright, para las pruebas
npm test
```

Recorre el flujo completo en un Chromium que simula un móvil: escanea un dibujo
de prueba, lo recorta, lo guarda, busca, crea fechas y planes, exporta y
restaura una copia, edita, borra, activa el código y comprueba que la app abre
sin conexión. Las capturas quedan en `.e2e-output/`.

### Detalles de implementación

- **Corrección de perspectiva:** se resuelve la homografía que lleva el
  rectángulo de salida al cuadrilátero que marcas con los dedos y se remuestrea
  con interpolación bilineal (`js/images.js`).
- **Acabado «escaneo»:** se estima la luz del papel (luminancia a baja
  resolución, dilatada y suavizada) y se divide la imagen por ese mapa, con la
  misma ganancia en los tres canales para no inventar colores. Así desaparecen
  las sombras y el papel queda blanco sin que el dibujo cambie de color.
- **Fotos:** se reducen a 1800 px de lado mayor y se guardan como JPEG, con una
  miniatura aparte para que la galería vaya fluida.
