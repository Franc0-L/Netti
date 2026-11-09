# Estado real de implementación

Este documento separa el diseño objetivo de las capacidades que existen en el repositorio. Actualizarlo cuando un cambio se integre o una validación se complete.

## Código presente en la rama de trabajo

| Área | Implementación visible | Estado de validación |
| --- | --- | --- |
| Framework | Next.js App Router, Cache Components y TypeScript estricto | Build/typecheck pendientes de CI |
| Base de datos | Pool pg, Drizzle y esquema tipado | Sin conexión real a Neon validada |
| Health | GET /api/health independiente de DB y Blob | Código revisado; despliegue no probado |
| Lectura pública | Portada, colecciones y páginas de artículo por tipo/slug | Implementado en rama; falta CI y datos reales |
| Visibilidad | Solo artículos publicados cuya fecha ya llegó | Consulta implementada; falta prueba de integración |
| Markdown | React Markdown, GFM y sanitización rehype | Test XSS añadido; falta ejecución CI |
| SEO | Metadata base, Open Graph, robots y sitemap de contenido visible | Código agregado; falta inspección HTTP en deployment |
| Validación | Esquema Zod discriminado; pruebas de publicación, etiquetas y URL | Tests añadidos; falta ejecución CI |
| Utilidades SEO | JSON-LD y CDATA seguros con pruebas unitarias | Tests añadidos; falta ejecución CI |
| Rutas editoriales | Mapeo de colecciones y rutas canónicas con pruebas | Tests añadidos; falta ejecución CI |
| Blob e imágenes | Upload autenticado de 2 MB, magic bytes, MIME, Sharp, WebP y variantes 480/960/1600; compensación de objetos | Implementado en rama; Blob/Neon reales y límites de runtime pendientes |
| Sesiones | login/logout/logoutAll con scrypt asíncrono, token opaco, digest en BD, expiración y rate limit por IP | Implementado en rama; falta probar contra Neon y revisar parámetros en Vercel |
| Server Actions editoriales | createArticle, updateArticle y publishArticle con Zod, control de sesión/origen, revisión transaccional y cache tags | Implementado en rama; typecheck, CI y DB real pendientes |
| Cron y reconciliación | No hay endpoint operativo de publicación/reconciliación | Pendiente |
| Backups | No hay workflow operativo de backup/restauración | Pendiente |

## Criterios para declarar algo terminado

- Implementado: el código existe y está conectado a una ruta o flujo real.
- Typecheck aprobado: check de CI completado correctamente.
- Tests aprobados: suite automatizada ejecutada y aprobada.
- Build aprobado: check de build de producción completado correctamente.
- Integración validada: prueba contra un entorno de prueba con dependencias reales.
- Producción validada: comportamiento observado en el deployment real, con evidencia y fecha.

No usar “funciona”, “seguro”, “rápido” o “listo para producción” basándose solo en que un archivo fue agregado.

## Pendientes prioritarios

1. Regenerar y versionar package-lock.json para habilitar npm ci.
2. Ampliar pruebas para visibilidad por fecha, cache tags, autenticación, expiración concurrente y sanitización Markdown con payloads adversariales.
3. Ejecutar tests, typecheck y build en CI; corregir todos los errores.
4. Ejecutar pruebas de integración para login, sesiones y mutaciones editoriales contra un esquema Neon de prueba.
5. Verificar upload de imágenes en Vercel/Blob con archivos válidos, corruptos, sobredimensionados y formatos AVIF/WebP.
6. Añadir migraciones reproducibles y comprobar que el esquema desplegado coincide con Drizzle.
7. Implementar publicación programada, invalidación de tags y reconciliación Blob.
8. Ejecutar pruebas de Neon, CSP, cron, Blob, backup y restauración del spike de Fase 0.
9. Verificar accesibilidad, responsive, metadatos y errores HTTP en un deployment real.

## Advertencias técnicas abiertas

- La política de cache debe validarse con las reglas de Cache Components de la versión instalada y con x-vercel-cache; no inferir persistencia compartida entre instancias.
- El contenido Markdown se sanitiza con el esquema por defecto de rehype-sanitize. Si se habilitan componentes Markdown adicionales, ampliar el esquema de forma explícita y probarlo.
- Las URLs de portada proceden de registros de medios; la carga y la validación de esos registros aún deben implementarse.
- El workflow actual usa npm install porque el lockfile está desactualizado. Esto no ofrece reproducibilidad equivalente a npm ci.
- El cache de contenido tiene una vida acotada de minutos como medida transitoria; la invalidación inmediata depende de que se implementen las acciones editoriales.

## Cambios en feat/editorial-auth-media-actions

- Las Server Actions de contenido exigen sesión y origen permitido, validan con Zod y registran snapshots dentro de la transacción.
- publishArticle vuelve a validar el contenido antes de cambiar el estado; updateArticle usa control optimista por version.
- El login usa scrypt asíncrono (N=131072, r=8, p=1), límite de concurrencia local, HMAC de IP y backoff progresivo.
- El upload acepta JPEG, PNG, WebP y AVIF hasta 2 MiB, valida firma y dimensiones, elimina metadatos mediante re-encodeo WebP y crea variantes.
- No se afirma que el esquema desplegado contenga los índices parciales, triggers de versión, FK o constraints descritos en docs/02.1-modelo-tablas.md: las migraciones reproducibles siguen pendientes.
