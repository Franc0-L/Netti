# Panel administrativo

## Rutas

| Ruta                   | Contenido                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `/admin/login`         | Login por contraseña.                                                                       |
| `/admin`               | Escritorio de artículos: búsqueda por título, filtros de tipo y estado, y paginación de 25. |
| `/admin/articles/new`  | Alta de un artículo (borrador).                                                             |
| `/admin/articles/[id]` | Edición, publicación, papelera, restauración e historial de revisiones.                     |
| `/admin/games`         | Listado de fichas de juego con filtro de estado y paginación de 25.                         |
| `/admin/games/new`     | Alta de una ficha de juego.                                                                 |
| `/admin/games/[id]`    | Edición y ciclo de vida de una ficha.                                                       |
| `/admin/media`         | Biblioteca de imágenes (100 más recientes) con filtro de marcadas para eliminación.         |

El layout de servidor de las rutas del panel exige una sesión válida. Las Server Actions vuelven a comprobar sesión y origen con `authorize()` (`src/app/actions/_shared.ts`); la protección visual no sustituye la autorización de cada acción.

## Escritorio

- La búsqueda es un `ILIKE` sobre el título, con los comodines `%`, `_` y `\` escapados: buscar `100%` no devuelve todo.
- Los parámetros de la URL (`q`, `tipo`, `estado`, `pagina`) se normalizan con `firstParamText`. Un parámetro repetido toma el primer valor en vez de romper el render.
- Sin filtro de estado se ven los tres: borrador, publicado y papelera. La papelera se restaura desde la misma tabla.
- Cada fila ofrece las acciones válidas para su estado; la columna de edición desaparece para lo que está en la papelera.

## Edición de artículos

Secciones del formulario:

1. **Contenido**: tipo (solo al crear), título, slug, bajada, cuerpo Markdown, autor y etiquetas.
2. **Publicación**: estado, fecha de publicación, destacado y aviso de reseñas programadas.
3. **Portada**: imagen, texto alternativo y crédito.
4. **Pros y contras**: hasta cinco puntos por lista.
5. **Video**: URL y título. Solo YouTube y Vimeo se embeben (YouTube con `youtube-nocookie.com`); cualquier otro enlace se muestra como enlace externo.
6. **Galería**: hasta 20 imágenes ordenables, con subida desde el propio editor.
7. **Datos de la reseña**: juego publicado, puntuación 0-100, desglose de historia, jugabilidad y visual (1-10), justificación y veredicto. La rareza no se elige: la deriva el trigger de la base.
8. **Fuente y SEO**: nombre y URL de la fuente, título y descripción para buscadores, imagen Open Graph.

El guardado de un borrador y la publicación son operaciones separadas. Las publicaciones existentes se editan sin cambiar su estado. El formulario envía la `version` que recibió y el servidor rechaza con `conflict` si otro guardado la movió; cuando la página entrega una versión nueva, el formulario se resincroniza con ella.

### Ciclo de vida

- **Publicar** exige los campos que la base también valida (título, slug, bajada, cuerpo y fecha). Una reseña solo se publica si el juego enlazado está publicado.
- **Despublicar** devuelve el artículo a borrador sin tocar su contenido.
- **Papelera**: guarda el estado anterior y la fecha. Restaurar vuelve a ese estado. No hay borrado definitivo desde el panel.
- **Restaurar revisión**: copia el contenido del snapshot y deja que el trigger cree una versión nueva. No restaura slug, estado, fecha de publicación ni destacado.

Se conservan las últimas 20 versiones (`REVISION_RETENTION`, `src/lib/revisions.ts`); las anteriores se podan en la misma transacción del guardado.

## Fichas de juego

- Título, slug, bajada, cuerpo, desarrollador, distribuidora y fecha de lanzamiento (`AAAA-MM-DD`).
- Hasta ocho plataformas, ocho géneros y ocho etiquetas, sin repetir.
- Portada con texto alternativo obligatorio; un juego publicado no puede quedar sin portada.
- Estado: borrador o publicado. **Despublicar o enviar a papelera se rechaza si el juego tiene reseñas publicadas**: primero hay que despublicarlas.
- La papelera es reversible y el slug queda libre mientras la ficha está dentro.

## Biblioteca de medios

- Las imágenes se suben por `POST /api/upload`, que aplica el límite de 2 MiB, valida magic bytes y procesa con Sharp (WebP sin EXIF y variantes 480/960/1600).
- Se editan `alt`, crédito, derechos y URL de origen.
- **Marcar para eliminación** es reversible: escribe `pending_delete_at`. El objeto se borra con `/api/cron/cleanup` tras la ventana de gracia y solo si nada lo referencia (portada, Open Graph, galería o `media:<id>` en un cuerpo). El panel avisa cuando un medio todavía está en uso.
- Las imágenes marcadas se pueden restaurar sin perder la referencia.

## Límites y pendientes

- La lista de medios muestra los 100 más recientes y un filtro de marcadas; no hay búsqueda por texto ni paginación.
- No hay borrado definitivo ni purga manual desde el panel: la papelera y el barrido son el mecanismo.
- No hay vista previa de Markdown ni editor visual de imágenes embebidas; el cuerpo se escribe como Markdown.
- La cobertura automática es HTTP (rutas, sesión y secciones). Falta revisar el panel en un navegador real: alta de juego, galería, video, papelera y restauración de una revisión.
- No se validó contra Neon/Blob reales ni en Vercel.
