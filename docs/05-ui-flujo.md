# Diseño UI/UX y Flujo Editorial — Netti

## 1. Paleta

**Decidida y vigente** — son los tokens reales de `src/app/globals.css`:

| Token              | Valor                           | Uso                                |
| ------------------ | ------------------------------- | ---------------------------------- |
| `--background`     | `#0d0b12`                       | Fondo de la página                 |
| `--surface`        | `#15121c`                       | Tarjetas                           |
| `--surface-raised` | `#1c1726`                       | Elementos elevados                 |
| `--foreground`     | `#f4f0fa`                       | Texto                              |
| `--muted`          | `#aaa1b8`                       | Texto secundario                   |
| `--line`           | `rgba(218, 202, 245, 0.15)`     | Bordes y separadores               |
| `--accent`         | `#b79aff`                       | Botones, enlaces, foco, selección  |
| `--accent-strong`  | `#d1bdff`                       | Hover y estados activos            |
| `--pattern`        | `url('/images/fondo-web.webp')` | Textura de fondo del sitio público |

El morado es **decisión cerrada** (12/11/2026): el cliente confirmó que la paleta de este proyecto es la correcta y que no se modifica. Los valores del diseño anterior (`#a78bfa`, `#c9bbff`, `#5b21b6`) quedan solo como antecedente del Netti Legacy.

El texto sobre morado es `#171020`. Contraste medido sobre `--background`: `--foreground` 17,4:1, `--muted` 7,9:1, `--accent` 8,5:1, `--accent-strong` 11,6:1. Ningún texto de interfaz baja de 4,5:1.

Tailwind v4 consume los tokens con `@theme`. Ningún color literal suelto en componentes, salvo el texto sobre morado (`#171020`) y el overlay del patrón de fondo.

**Tokens semánticos del legacy, ya implementados** — se agregaron sin tocar `--accent`, `--accent-strong` ni `--background`:

| Token del legacy | Valor     | Uso en este proyecto                                              |
| ---------------- | --------- | ----------------------------------------------------------------- |
| `--gold`         | `#e6bd55` | Rareza "Mítica", barra de "Nivel de biblioteca", icono de trofeo  |
| `--green`        | `#53bd83` | Rareza "Poco común", degradado de la barra de progreso            |
| `--cyan`         | `#5ac7e8` | Rareza "Rara", chip de la sección Juegos                          |
| `--red`          | `#f16c79` | Rareza "Legendaria", chip de la sección Noticias, corazón del pie |
| `--neutral`      | `#a0a1aa` | Rareza "Común"                                                    |

Cada rareza se pinta con un token propio (`--rarity-gold`, `--rarity-red`, `--rarity-accent`, `--rarity-cyan`, `--rarity-green`, `--rarity-neutral`). El token que usa cada banda lo decide la fila de `score_rarities`, no la interfaz.

El `--accent-deep` del legacy (`#5b21b6`) no se porta: el morado vigente ya resuelve la sombra dura con `color-mix` sobre `--accent`.

## 2. Tipografía

**Vigente**: Geist y Geist Mono vía `next/font/google` (`src/app/layout.tsx`), con fallback de sistema. Cuerpo de artículo 1.125 rem, interlineado 1.7, ancho máximo 68 caracteres.

El diseño original usaba Quicksand auto-hospedada desde `public/fonts/`. **No se porta**: el cliente decidió (12/11/2026) mantener la tipografía actual.

### 2.1 Assets propios del cliente

Traídos del Netti Legacy, hechos a mano por el cliente, en `public/images/`:

| Archivo                                      | Uso                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `logo-netti.png` (1000×1000)                 | Monograma "N." del pie y imagen social (`og:image`, `twitter:image`)                      |
| `fondo-web.webp` (640×640, tile)             | Textura de logos de estudio; se aplica en `body` bajo una capa del 98 % de `--background` |
| `platforms/{pc,playstation,switch,xbox}.png` | Iconos de plataforma en las fichas de `/juegos`                                           |

La textura solo se ve en el sitio público: el panel usa un fondo sólido (`#100d16`) y no la muestra.

Los iconos de plataforma se eligen por tolerant matching (`src/lib/platforms.ts`): "PS5", "PlayStation 5" o "Xbox Series X" resuelven al mismo PNG. Una plataforma sin icono conocido no muestra imagen, pero conserva su nombre.

## 3. Sitio público

Estado real de la interfaz migrada desde el Netti Legacy:

- **Encabezado**: wordmark "NETTI." con el punto morado y navegación en píldoras: Juegos, Reseñas, Noticias y Guías. La sección activa se marca con `aria-current="page"`.
- **Buscador central**: en la portada, con el placeholder "¿Qué estás buscando? Juegos, reseñas, noticias…". Es un formulario `GET` a `/buscar`, así que funciona sin JavaScript y el resultado se puede compartir por URL.
- **Chips de sección**: en la portada, en las colecciones y en el buscador. Cada sección conserva su color del legacy: cyan = Juegos, gold = Reseñas, red = Noticias, green = Guías.
- **Chips de categoría**: en las colecciones, con las categorías reales del contenido (por ejemplo, las noticias). Filtran por `?categoria=` y se resuelven en el servidor.
- **Nivel de biblioteca**: barra de progreso con los juegos publicados y los que ya tienen reseña (`0/0 reseñados` cuando la biblioteca está vacía), con `role="progressbar"` y el mensaje del logro pendiente.
- **Colecciones** (`/resenas`, `/noticias`, `/guias`): artículo principal a todo el ancho, grilla de artículos y aside **"Historias principales"** con las cuatro historias más recientes.
- **Juegos** (`/juegos`): catálogo de fichas publicadas con plataformas (iconos del cliente) y géneros.
- **Puntuación**: badge con la rareza derivada de la base de datos y, en el detalle de la reseña, el desglose de historia, jugabilidad y apartado visual.
- **Pie de página**: cuatro columnas (marca, Secciones, Legal, Contacto) con los iconos en SVG inline, el correo de contacto y las redes (YouTube, Instagram, TikTok), más la barra legal con el aviso de marcas.
- **Páginas legales**: `/terminos` y `/privacidad`.
- **404 real**; si el slug no existe, se consulta `redirects` por la ruta anterior y se responde con el código almacenado (`301`, `302`, `307` o `308`) si existe una redirección interna válida; si no, 404.

Pendiente del diseño original: vista de detalle de juego (`/juegos/[slug]`), "Juego al azar" en la portada y contador de estadísticas por colección.

## 4. Panel (pantalla completa)

```
┌──────────────────────────────────────────────────────────────┐
│ Netti.   [Juegos] [Reseñas] [Noticias] [Guías]     [Salir]   │
├───────────────┬──────────────────────────────────────────────┤
│ Buscar…       │  Título del artículo        ● Borrador       │
│               │  [Vista previa] [Guardar] [Publicar]         │
│  Artículo     │                                              │
│  Artículo     │  Título          [__________________]        │
│  Artículo     │  Slug            [__________________] 🔒     │
│               │  Descripción     [__________________] 42/240 │
│  ─────────    │                                              │
│  Papelera     │  Cuerpo                                      │
│               │  [ área grande de Markdown            ]      │
│               │                                              │
│               │  Metadatos        Portada        Historial   │
└───────────────┴──────────────────────────────────────────────┘
```

- Sidebar con búsqueda, lista por colección y Papelera.
- Formulario siempre visible.
- Vista previa en modal con **la plantilla real**, mismo pipeline de sanitizado que el sitio. Si el cliente renderizara distinto, la vista previa mentiría.
- Estado visible en todo momento: borrador, publicado o en papelera. "Programado" no es un estado: es publicado con fecha futura, y se muestra como "Se publica el 12/12 a las 09:00".

## 5. Principios

1. **Nunca se pierde trabajo.** Autoguardado en `localStorage` cada 5 segundos, con aviso al salir. Si llega `401` (sesión vencida), el panel reautentica y restaura el borrador local **validándolo con Zod**: el esquema puede haber cambiado.
2. **Guardar no publica.** En un borrador los botones son "Guardar borrador" y "Publicar". En una entrada publicada son "Guardar cambios" y "Despublicar".
3. **Sin redirecciones silenciosas.** Cada acción deja un mensaje explícito.
4. **Conflictos visibles.** Si `version` no coincide, se muestra el estado actual y se ofrece recargar. No se pisa trabajo.
5. **Slug automático y bloqueado.** Se genera del título, editable hasta la primera publicación. Después, cambiarlo es explícito y crea una redirección 308.
6. **Atajos**: `Ctrl/Cmd+S` guarda, `Ctrl/Cmd+Shift+S` publica, `Ctrl/Cmd+P` abre vista previa, `Esc` cierra el modal.
7. **Confirmaciones destructivas**: borrar pide confirmación con el título; purgar exige escribir el slug.
8. **Responsivo** desde 1024 px. En móvil se consulta y corrige, no se escribe una reseña larga.

## 6. Accesibilidad

- `<label>` asociado en todo input; el placeholder no es etiqueta.
- Botones de icono con `aria-label`.
- Foco visible de 2 px con `--accent`.
- Modal con trampa de foco, `Esc` y foco devuelto al disparador.
- Errores con `aria-live="polite"` y `aria-describedby` en el campo.
- Nada depende solo del color para indicar estado.

## 7. Flujo

### 7.1 Login

1. `/admin/login`, contraseña.
2. Rate limit por IP antes de verificar; si está bloqueado, se muestra el tiempo restante.
3. Sesión de 8 horas deslizante, tope absoluto de 30 días.
4. Redirección a `/admin/panel`.

### 7.2 Panel

Listado por colección con estado, versión y última modificación. Acciones: Editar, Borrar. Buscador full-text en español, sin tildes.

### 7.3 Crear

1. "Nuevo" abre un formulario vacío en `draft`.
2. Se elige la colección.
3. Título genera el slug.
4. Cuerpo Markdown con barra mínima: negrita, itálica, enlace, H2, cita, imagen, lista.
5. Metadatos según colección. En reseñas, el juego se busca con autocompletado (`pg_trgm`). Crear la ficha desde la reseña queda para después del primer lanzamiento: en la v1, la ficha se crea antes desde Juegos. La puntuación va de 0 a 100 y las subpuntuaciones (historia, jugabilidad, apartado visual) van de 1 a 10; la rareza la calcula la base de datos a partir del score y no se escribe a mano.
6. **Portada e imágenes del cuerpo**: se eligen de la biblioteca de medios o se suben arrastrando. **El cliente redimensiona a WebP antes de subir**, porque un PNG de 1080p supera los 2 MB. Cada imagen exige texto alternativo y permite crédito y procedencia (`own`, `press`, `third_party`). Las imágenes del cuerpo no se pegan como URL: se insertan desde el selector y el Markdown guarda `![alt](media:12)`, que el render resuelve con `srcset` y dimensiones.
7. Guardar borrador o publicar. Los errores aparecen junto al campo.

### 7.4 Editar

Se carga la entrada con su `version`. Al guardar se envía esa versión. Si otro proceso la cambió, llega `conflict` con el estado actual y se ofrece recargar.

**Una entrada publicada no se despublica al guardar.** "Guardar cambios" mantiene el estado y revalida; "Despublicar" es una acción aparte.

### 7.5 Programar

Se elige una fecha futura y se publica. La entrada queda `published` con `published_at` futuro y no se ve hasta la hora. El job de revalidación la activa.

La interfaz dice **"Se publica el 12/12 a las 09:00"** y no promete precisión al segundo: el job de revalidación se ejecuta periódicamente (cada 30 minutos por defecto, pero GitHub Actions puede retrasar o descartar ejecuciones bajo carga). Si el job se atrasa, la entrada aparece igual en la siguiente ejecución exitosa; nunca se muestra antes de tiempo porque la consulta exige `published_at <= now()`.

### 7.6 Vista previa

Modal con la plantilla real: cabecera, ancho, tipografía, JSON-LD. `Esc` cierra y devuelve el foco. Usa **el mismo pipeline de sanitizado y el mismo resolvedor de `media:`** que el sitio público; si el cliente renderizara distinto, la vista previa mentiría.

### 7.7 Borrar y papelera

1. Confirmación con el título.
2. Pasa a `trashed` guardando el estado anterior y la fecha. El slug queda libre.
3. Papelera: recuperar o eliminar definitivamente.
4. **Recuperar con slug ocupado**: el servidor reintenta con `-2`, `-3`… hasta 10 veces y devuelve el slug definitivo. El panel no lo pide antes ni lo elige: muestra "Se recuperó como `mi-articulo-2`". Si el slug original lo ocupa otro artículo, **no se crea redirección** desde él (apropiaría la URL del artículo nuevo).
5. Purgar exige escribir el slug y sigue el orden mark-and-sweep: primero se borra la fila del artículo (la FK `ON DELETE RESTRICT` protege `media` si aún se usa como `cover_media_id`/`og_media_id`), recién entonces se marca `pending_delete_at` en los medios huérfanos, después se borra el objeto en Blob. Si Blob falla, la fila queda marcada y se reintenta; el artículo ya no está.

### 7.8 Historial

Lista de revisiones con fecha y versión. Se puede ver el snapshot y restaurar uno anterior (crea una versión nueva, no reescribe el pasado). Se conservan las últimas 20. Restaurar un snapshot es una escritura normal: exige la `version` actual y pasa por Zod como cualquier otra.

### 7.9 Cerrar sesión

Borra la sesión en el servidor y la cookie. "Cerrar todas las sesiones" invalida todos los dispositivos.

## 8. Mensajes

| Situación             | Texto                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| Borrador              | "Borrador guardado."                                                             |
| Publicado             | "Publicado. Ya está visible en el sitio."                                        |
| Programado            | "Se va a publicar el 12/12 a las 09:00."                                         |
| Conflicto             | "La publicación cambió mientras editabas. Recargá para ver la última versión."   |
| Slug ocupado          | "Ese slug ya está en uso. Probá con otro."                                       |
| Sesión vencida        | "Tu sesión venció. Volvé a entrar; tu borrador está guardado en este navegador." |
| Imagen grande         | "La imagen no puede superar los 2 MB."                                           |
| Imagen animada        | "Las imágenes animadas no están soportadas."                                     |
| Formato inválido      | "Formato no admitido. Usá JPEG, PNG, WebP o AVIF."                               |
| Recuperado con sufijo | "Se recuperó como «mi-articulo-2»."                                              |
| Sin conexión          | "No se pudo guardar. Tu borrador sigue en este navegador."                       |

## 9. Accesibilidad implementada (WCAG 2.2 AA)

Estado real del código. La sección 1 describe la paleta vigente; el repositorio usa los tokens `--background`, `--surface`, `--foreground`, `--muted`, `--line`, `--accent` y `--accent-strong`, más los semánticos `--gold`, `--green`, `--cyan`, `--red` y `--neutral` de `src/app/globals.css`, con la tipografía Geist.

| Criterio                        | Implementación                                                                                                                                 | Archivo                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 2.4.1 Evitar bloques            | Skip link "Ir al contenido principal" como primer elemento enfocable                                                                           | `src/components/site-chrome.tsx`                     |
| 1.3.1 Información y relaciones  | `<main id="contenido">`, `<header>` y `<footer>` fuera del `main`, landmarks por página                                                        | páginas públicas y panel                             |
| 1.4.3 Contraste                 | Texto muted 7.9:1, accent 8.5:1, etiquetas del hero 7.9:1 sobre el fondo                                                                       | `src/app/globals.css`                                |
| 1.4.11 Contraste no textual     | Bordes de inputs y botones con `rgba(218, 202, 245, 0.4)` o más (3:1 o superior)                                                               | `src/app/globals.css`                                |
| 2.4.7 Foco visible              | Anillo de 2 px en todos los elementos con `:focus-visible`                                                                                     | `src/app/globals.css`                                |
| 2.4.11 Foco no tapado           | `scroll-margin-block` para el encabezado fijo                                                                                                  | `src/app/globals.css`                                |
| 2.5.8 Tamaño del objetivo       | Botones de 40 px, checkbox de 18 px dentro de una fila de 24 px; enlaces de navegación con `min-height: 24px` y padding                        | `src/app/globals.css`                                |
| 3.2.3 Navegación coherente      | `aria-current="page"` en la sección activa del encabezado y en los chips de sección                                                            | `src/components/site-chrome.tsx`                     |
| 4.1.2 Nombre, rol, valor        | El buscador es un `form` con `role="search"`, el input tiene `aria-label` y la barra de biblioteca expone `role="progressbar"` con sus valores | `src/components/search-form.tsx`, `src/app/page.tsx` |
| 3.3.1 Identificación de errores | `aria-invalid` y `aria-describedby` con ids estables por campo; el foco va al primer control inválido                                          | `src/components/admin-article-form.tsx`              |
| 4.1.3 Mensajes                  | `role="alert"` para errores y `role="status"` para confirmaciones                                                                              | formulario editorial y login                         |
| 1.4.4 / 3.3.2 Entrada de datos  | `autocomplete="current-password"` en el login; campos editoriales con etiqueta y `maxLength`                                                   | login y formulario editorial                         |
| 1.4.3 / 1.4.11 Contraste        | `prefers-contrast: more` refuerza líneas y color muted                                                                                         | `src/app/globals.css`                                |
| 3.1.1 Idioma                    | `<html lang="es">` en todas las páginas                                                                                                        | `src/app/layout.tsx`                                 |
| 2.4.5 / 2.4.6 Títulos           | Un solo `h1` por página y jerarquía de encabezados coherente                                                                                   | páginas públicas                                     |
| Tablas                          | `<caption>` visualmente oculto y `scope="col"`                                                                                                 | panel editorial                                      |
| Enlaces externos                | Aviso para lectores de pantalla "(se abre en una nueva ventana)"                                                                               | `src/components/markdown-content.tsx`                |
| 2.3.3 Animaciones               | `prefers-reduced-motion` respetado                                                                                                             | `src/app/globals.css`                                |

Verificación automática en `npm run test:http`: idioma, `title`, viewport, canonical, skip link antes de la navegación, un único `h1`, imágenes con `alt`, `robots.txt` y `sitemap.xml`. La revisión manual con lector de pantalla y navegación por teclado queda pendiente de un entorno con navegador.
