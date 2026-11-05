# Netti 🎮

Blog editorial de videojuegos con **Astro SSR** y panel editorial propio. El contenido vive en un repositorio privado separado (`Contenido-Netti`) y se consume mediante la API de GitHub en cada request del servidor.

---

## 📋 Tabla de contenidos

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- 🚀 [Despliegue en Vercel](#despliegue-en-vercel)
- [Variables de entorno](#variables-de-entorno)
- [Scripts disponibles](#scripts-disponibles)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Panel editorial](#panel-editorial)
- [Tests](#tests)
- [Documentación](#documentación)
- [Contrato editorial](#contrato-editorial)
- [Licencia](#licencia)

---

## Características

- **Astro SSR** con adaptador de Vercel (`output: "server"`)
- **Panel editorial** en `/admin/` con autenticación por cookie de sesión
- **Contenido desde GitHub privado**: lecturas y escrituras vía API de GitHub
- **Endpoint de medios** `/media/[...path]` para servir imágenes del repositorio privado
- **Validación de contenido** con schemas Zod compartidos entre sitio y panel
- **Páginas dinámicas**: juegos, reseñas, noticias y guías (listado y detalle)
- **Páginas públicas**: inicio, 404, privacidad, términos, buscar
- **Diseño oscuro** con fuente Quicksand y botones 3D
- **Tests**: accesibilidad, rendimiento, build smoke, security headers, media URLs, API admin, Markdown sanitize, platform logos
- **CI/CD**: GitHub Actions que ejecuta `astro check`, `vitest run` y `astro build`

---

## Arquitectura

```
┌─────────────────┐      HTTPS API      ┌─────────────────────────┐
│   Usuario       │ ◄──────────────────► │   Netti (Astro SSR)   │
│   (navegador)   │                      │   en Vercel           │
└─────────────────┘                      └─────────────────────────┘
                                             │
                                             │ HTTPS API (token)
                                             ▼
                                     ┌─────────────────┐
                                     │ Contenido-Netti │
                                     │ (repositorio    │
                                     │  privado)       │
                                     └─────────────────┘
```

- **Sitio público** (`Netti`): este repositorio. Renderiza páginas SSR leyendo contenido de GitHub.
- **Contenido** (`Contenido-Netti`): repositorio privado con archivos `.md` bajo `content/{coleccion}/`.
- **Panel editorial** (`/admin/`): permite crear, editar y eliminar artículos, escribiendo de vuelta al repositorio de contenido.

---

## Requisitos

| Requisito | Versión |
|-----------|---------|
| Node.js | >= 22.23.4 |
| npm | cualquier versión reciente |

---

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/Franc0-L/Netti.git
cd Netti

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus valores reales
# (mínimo: CONTENT_GITHUB_TOKEN, CONTENT_GITHUB_REPO, ADMIN_PASSWORD, ADMIN_SESSION_SECRET)

# Iniciar en desarrollo
npm run dev
```

---

## Despliegue en Vercel

1. Conectar el repositorio `https://github.com/Franc0-L/Netti.git` a Vercel
2. Configurar las variables de entorno en la consola de Vercel
3. Desplegar — Vercel ejecutará `npm run build` automáticamente

El proyecto ya incluye `vercel.json` con:
- `buildCommand: "npm run build"`
- `outputDirectory: "dist"`
- `cleanUrls: true`
- Cabeceras de seguridad globales y específicas para `/admin/` y `/api/`

---

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `CONTENT_GITHUB_TOKEN` | ✅ Sí | Token de GitHub para acceder al repositorio de contenido |
| `CONTENT_GITHUB_REPO` | ✅ Sí | Repositorio de contenido (formato `owner/repo`) |
| `ADMIN_PASSWORD` | ✅ Sí | Contraseña de acceso al panel editorial |
| `ADMIN_SESSION_SECRET` | ✅ Sí | Secreto para firmar cookies de sesión (mínimo 32 caracteres) |
| `PUBLIC_SITE_URL` | ❌ No | URL pública del sitio (sitemap, URLs canónicas) |
| `RAWG_API_KEY` | ❌ No | Clave para enriquecer fichas con RAWG API |
| `ADMIN_LOGIN_GLOBAL_MAX` | ❌ No | Límite global de intentos de login (default: 120) |

> ⚠️ Nunca subir valores reales a Git. El archivo `.env` está en `.gitignore`.

---

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo en `localhost:4321` |
| `npm run build` | Build de producción para Vercel |
| `npm run preview` | Vista previa del build |
| `npm run check` | TypeScript + Astro type checking |
| `npm run validate:content` | Valida archivos `.md` del repositorio de contenido |
| `npx vitest run` | Ejecutar suite de tests |

---

## Estructura del proyecto

```
Netti/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI: astro check, vitest, astro build
├── api/
│   ├── _lib/
│   │   ├── security.ts         # Sesiones, cookies, assertSameOrigin, json, logAdminError
│   │   ├── github/
│   │   │   ├── client.ts       # Cliente GitHub con retries y rate limiting
│   │   │   └── contents.ts     # Leer/escribir/borrar archivos en GitHub
│   │   └── content/
│   │       ├── validation.ts   # Validación de campos (schemas Zod)
│   │       ├── serialization.ts # Parse/serialize Markdown frontmatter
│   │       ├── repository.ts   # Listar, leer entradas, paginación
│   │       └── trash.ts        # Borrado recuperable a papelera
│   ├── admin/
│   │   ├── login.ts            # Autenticación y rate limiting
│   │   ├── content.ts          # CRUD de artículos (GET, POST, PUT, DELETE)
│   │   └── upload.ts           # Subida de imágenes con validación de magic bytes
├── public/
│   ├── admin/
│   │   ├── index.html          # Login
│   │   ├── panel.html          # Panel principal (CRUD)
│   │   ├── admin.js            # Redirección al panel si hay sesión
│   │   └── js/
│   │       ├── platform-picker.js  # Selector de plataformas
│   │       └── panel.js        # Lógica del panel (listar, crear, editar, borrar)
│   ├── images/
│   │   ├── logo-netti.png
│   │   ├── fondo-web.webp
│   │   └── platforms/
│   │       ├── switch.png, xbox.png, playstation.png, pc.png
│   ├── manifest.webmanifest
│   ├── robots.txt
│   └── favicon.svg
├── src/
│   ├── lib/
│   │   ├── env-config.ts       # Lectura y validación de variables de entorno
│   │   ├── env.ts              # Wrapper serverEnv
│   │   ├── editorial-contract.ts # Schemas Zod (contrato editorial)
│   │   ├── github-fetch.ts     # Cliente GitHub compartido
│   │   ├── fetch-content.ts    # Lectura de colecciones con caché
│   │   ├── image-url.ts        # Normalización de rutas de imagen
│   │   ├── markdown.ts         # Renderizado Markdown + reescritura de rutas
│   │   ├── platform-logos.js   # Catálogo de logos de plataformas
│   │   ├── similar-games.ts    # Juegos similares por géneros
│   │   └── rawg.ts             # Datos complementarios de RAWG API
│   ├── layouts/
│   │   └── BaseLayout.astro    # Layout base con skip-link, footer, SEO
│   ├── styles/
│   │   └── main.css            # Variables CSS, botones 3D, artículos, etc.
│   ├── pages/
│   │   ├── index.astro         # Inicio con spotlight, quest, últimas noticias
│   │   ├── 404.astro           # Página no encontrada con sugerencias
│   │   ├── privacidad.astro    # Política de privacidad
│   │   ├── terminos.astro      # Términos y condiciones
│   │   ├── buscar/             # Buscador general
│   │   │   └── index.astro
│   │   ├── search-index.json.ts # Endpoint JSON para búsqueda
│   │   ├── media/[...path].ts  # Endpoint de imágenes editoriales
│   │   ├── middleware.ts       # Caché HTTP para HTML/JSON
│   │   ├── juegos/             # Listado y detalle de juegos
│   │   ├── resenas/            # Listado y detalle de reseñas
│   │   ├── noticias/           # Listado y detalle de noticias
│   │   └── guias/              # Listado y detalle de guías
├── scripts/
│   ├── content-validator.ts    # Valida archivos .md del repositorio de contenido
│   └── validate-content.sh     # Script de conveniencia
├── tests/
│   ├── accessibility.test.ts   # Páginas usan BaseLayout, imágenes con alt, inputs con label
│   ├── performance.test.ts     # astro build en <60s, dist/ existe
│   ├── build-smoke.test.ts     # output: server, adapter Vercel, dependencias, /404
│   ├── security-headers.test.ts # Cabeceras de seguridad en vercel.json
│   ├── media-url.test.ts       # Magic bytes, safeRepoPath, caché de medios
│   ├── admin-api.test.ts       # Rate limiting, timingSafeEqual, assertSameOrigin, schemas
│   ├── markdown-sanitize.test.ts # rehype-sanitize, rehypeRaw, reescritura de imágenes
│   └── platform-logos.test.ts  # PLATFORM_PRESETS, platformSymbol, platformImage, catalogForAdmin
├── docs/
│   ├── architecture/           # Visión general, flujo SSR, caché
│   ├── domain/                 # Colecciones, contratos editoriales
│   ├── services/               # GitHub API, RAWG API
│   ├── operations/             # Variables de entorno, despliegue en Vercel
│   ├── security/               # Cabeceras de seguridad, sesiones de admin
│   └── testing/                # Pruebas pendientes
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── vercel.json
├── vitest.config.mjs
└── README.md
```

---

## Panel editorial

El panel editorial está en `/admin/` y requiere autenticación.

### Flujo

1. **Login**: `/admin/` — formulario con contraseña. Al autenticarse, se redirige al panel.
2. **Panel principal**: `/admin/panel.html` — sidebar con colecciones (juegos, reseñas, noticias, guías), listado paginado de artículos, botón "Nuevo artículo" y acceso a la papelera.
3. **Editor**: modal emergente con campos de título, slug, descripción, cuerpo Markdown (con preview en tiempo real), etiquetas, juego relacionado (reseñas/guías), puntuación (reseñas) y subida de imagen de portada.
4. **Acciones**: crear, editar, borrar (borrado recuperable a papelera), recuperar desde papelera.

### Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/admin/login` | Autenticación (`action: "login"` o `"logout"`) |
| `GET` | `/api/admin/content` | Listar entradas o leer una por slug |
| `POST` | `/api/admin/content` | Crear un artículo |
| `PUT` | `/api/admin/content` | Editar un artículo (requiere `sha`) |
| `DELETE` | `/api/admin/content` | Borrar un artículo (requiere `sha`) |
| `POST` | `/api/admin/upload` | Subir una imagen (base64, validación de magic bytes) |

---

## Tests

Se utilizan **vitest** para la suite de pruebas. Ejecutar con:

```bash
npx vitest run
```

### Tests implementados

| Archivo | Qué valida |
|---------|------------|
| `accessibility.test.ts` | Páginas usan BaseLayout, imágenes con `alt`, inputs con `label` o `aria-label` |
| `performance.test.ts` | `astro build` completa en <60 segundos, `dist/` existe |
| `build-smoke.test.ts` | `output: "server"`, adapter Vercel, cabeceras de seguridad, dependencias, páginas `[slug]` usan `Astro.rewrite("/404")` |
| `security-headers.test.ts` | Cabeceras CSP, HSTS, Referrer-Policy, Permissions-Policy en `vercel.json` |
| `media-url.test.ts` | Magic bytes (PNG, JPEG, WebP), `safeRepoPath` contra path traversal, caché en memoria |
| `admin-api.test.ts` | Rate limiting, `timingSafeEqual`, `assertSameOrigin`, `hasSession`, validación con schemas, tipos de imagen, `COOKIE_NAME`, `SESSION_SECONDS` |
| `markdown-sanitize.test.ts` | `rehype-sanitize`, `rehypeRaw`, reescritura de rutas de imagen en `markdown.ts` |
| `platform-logos.test.ts` | `PLATFORM_PRESETS`, `PLATFORM_IMAGES`, `platformSymbol`, `platformImage`, `canonicalizePlatforms`, `catalogForAdmin` |

---

## Contrato editorial

El archivo `src/lib/editorial-contract.ts` define los schemas Zod que son la **fuente de verdad** para validar el frontmatter y el cuerpo de las publicaciones. Los mismos schemas se usan tanto para leer contenido del sitio público como para escribir desde el panel editorial.

**Colecciones:** `games`, `reviews`, `news`, `guides`

**Etiquetas editoriales permitidas:** "En análisis", "Actualizado", "Rejugado", "Recomendado", "Joyita", "Imprescindible", "Cooperativo", "Para jugar en cooperativo", "Multijugador", "Un jugador", "Indie", "AAA", "Acceso anticipado" (máximo 12, sin repeticiones).

**Imágenes:** Si se define `coverImage` o `heroImage`, es obligatorio definir también `coverAlt` o `heroAlt` respectivamente.

---

## Documentación

La carpeta `docs/` contiene documentación detallada organizada por temas:

- `architecture/` — Visión general, flujo SSR, caché
- `domain/` — Colecciones, contratos editoriales
- `services/` — Integración con GitHub API, RAWG API
- `operations/` — Variables de entorno, despliegue en Vercel
- `security/` — Cabeceras de seguridad, sesiones de administración
- `testing/` — Pruebas pendientes

---

## Licencia

MIT

---

Desarrollado con ❤️ para la comunidad gamer.
