# Estado real de implementación

Este documento separa el diseño objetivo de las capacidades que existen en el repositorio. Actualizarlo cuando un cambio se integre o una validación se complete.

## Código presente en la rama de trabajo

| Área | Implementación visible | Estado de validación |
| --- | --- | --- |
| Framework | Next.js App Router, Cache Components y TypeScript estricto | Build/typecheck pendiente de CI |
| Base de datos | Pool pg, Drizzle y esquema tipado | Sin conexión real a Neon validada |
| Health | GET /api/health independiente de DB y Blob | Código revisado; despliegue no probado |
| Lectura pública | Portada, colecciones y artículos por tipo/slug | Código agregado en PR; falta CI y datos reales |
| Visibilidad | Solo artículos publicados cuya fecha ya llegó | Consulta implementada; falta prueba de integración |
| Markdown | React Markdown, GFM y sanitización rehype | Dependencias incorporadas; falta CI y pruebas XSS |
| SEO | Metadata base, Open Graph, robots y sitemap de contenido visible | Código agregado; falta inspección HTTP en deployment |
| Validación | Esquema Zod discriminado para reseña/noticia/guía | Sin suite automatizada de casos todavía |
| Blob | Adaptador de almacenamiento con put/del/list | Sin subida real, cuotas ni compensación probadas |
| Sesiones | Emisión de token, hash persistido, expiración y revocación | Sin caller de login ni pruebas de integración |
| Administración | No hay rutas ni Server Actions editoriales conectadas | Pendiente |
| Cron y reconciliación | No hay endpoint operativo de publicación/reconciliación | Pendiente |
| Backups | No hay workflow operativo de backup/restauración | Pendiente |

## Criterios para declarar algo terminado

- Implementado: el código existe y está conectado a una ruta o flujo real.
- Typecheck aprobado: check de CI completado correctamente.
- Build aprobado: check de build de producción completado correctamente.
- Integración validada: prueba contra un entorno de prueba con dependencias reales.
- Producción validada: comportamiento observado en el deployment real, con evidencia y fecha.

No usar “funciona”, “seguro”, “rápido” o “listo para producción” basándose solo en que un archivo fue agregado.

## Pendientes prioritarios

1. Regenerar y versionar package-lock.json para habilitar npm ci.
2. Agregar pruebas unitarias para validación, rutas, visibilidad, SEO y ciclo de sesión.
3. Probar typecheck/build en CI y corregir todos los errores.
4. Implementar login completo y acciones administrativas con rate limit.
5. Implementar upload con validación de bytes, Sharp, variantes y compensación ante fallos.
6. Añadir migraciones reproducibles y comprobar que el esquema desplegado coincide con Drizzle.
7. Implementar publicación programada, invalidación de tags y reconciliación Blob.
8. Ejecutar pruebas de Neon, CSP, cron, Blob, backup y restauración del spike de Fase 0.
9. Verificar accesibilidad, responsive, metadatos y errores HTTP en un deployment real.

## Advertencias técnicas abiertas

- La política de cache debe validarse con las reglas de Cache Components de la versión instalada y con x-vercel-cache; no inferir persistencia compartida entre instancias.
- El contenido Markdown se sanitiza con el esquema por defecto de rehype-sanitize. Si se habilitan componentes Markdown adicionales, ampliar el esquema de forma explícita y probarlo.
- Las URLs de portada proceden de registros de medios; la carga y la validación de esos registros aún deben implementarse.
- El workflow actual usa npm install porque el lockfile está desactualizado. Esto no ofrece reproducibilidad equivalente a npm ci.
