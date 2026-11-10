# Panel administrativo

## Rutas

- /admin/login: login por contraseña.
- /admin: listado de los 100 artículos modificados más recientemente.
- /admin/articles/new: crear borrador.
- /admin/articles/[id]: editar un borrador o publicación.

El layout de servidor de las rutas del panel exige una sesión válida. Las Server Actions vuelven a comprobar sesión y origen; la protección visual no sustituye la autorización de cada acción.

## Edición

El editor permite cambiar tipo (solo al crear), título, slug, bajada, cuerpo Markdown, autor, etiquetas, destacado, portada, texto alternativo, imagen Open Graph y campos de reseña/noticia. El guardado de un borrador y la publicación son operaciones separadas. Las publicaciones existentes se pueden editar sin cambiar su estado.

Las imágenes se suben mediante POST /api/upload, que aplica el límite de 2 MiB y el procesamiento Sharp existente. La selección usa los últimos 60 medios activos y permite definir portada y OG por separado.

## Límites actuales

- La UI de reseñas requiere que el catálogo ya tenga juegos publicados; todavía no existe CRUD de juegos.
- No hay papelera/restauración, rollback de revisiones, borrado de medios ni editor visual de imágenes embebidas en Markdown.
- La lista de medios está limitada a 60 registros recientes; falta paginación/búsqueda.
- No se validó con Neon/Blob reales ni en Vercel. No introducir credenciales ni desplegar para probar como parte de este bloque.
