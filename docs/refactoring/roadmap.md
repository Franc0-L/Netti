# Roadmap de refactorización

## Principios

- Cambios pequeños por responsabilidad, agrupados en PRs coherentes.
- No eliminar ni reemplazar flujos existentes sin pruebas equivalentes.
- No reescribir todo el panel de una sola vez.
- Cada PR debe incluir pruebas y evidencia de CI.
- Mantener `main` como producción y sincronizar `develop` después de integrar cambios aprobados.

## Etapas

### 1. Base y seguridad funcional
- [x] Separar la vista previa Markdown del controlador del panel.
- [x] Escapar HTML arbitrario y rechazar esquemas URL peligrosos en la vista previa.
- [x] Añadir pruebas de regresión para la vista previa.
- [x] Auditar los puntos restantes donde se usa `innerHTML` con contenido dinámico: escapar texto/atributos y validar rutas locales de imágenes del navegador de medios.
- [ ] Revisar y adaptar las pruebas E2E/SSR heredadas de Netti-Legacy.\n  - [x] Añadir integración de handlers reales del administrador (login, alta, duplicados y subida de imágenes).\n  - [ ] Adaptar cobertura de edición, borrado/restauración y runtime SSR.\n  - [ ] Recuperar auditorías Axe y navegación por teclado con selectores actuales.

### 2. Administrador
- [x] Extraer un cliente HTTP compartido y centralizar respuestas y errores de la API del panel.
- [ ] Separar listado/navegación y controladores de la papelera.
- [x] Extraer la lógica del formulario editorial (metadatos, etiquetas, nombre del enlace y armado del contenido) a un módulo probado.
- [x] Extraer validación, codificación y llamada API de subida de imágenes a un módulo probado.
- [ ] Separar el navegador de medios y su selección de la lógica principal del panel.
- [x] Extraer el renderizado de listados, papelera y navegador de medios a vistas independientes con pruebas.
- [x] Corregir búsqueda para que abarque toda la colección, no solo la página cargada.
- [x] Cachear el índice de búsqueda y limitar la concurrencia de lecturas.
- [ ] Unificar estados de carga, error, vacío y guardado.
- [ ] Revisar accesibilidad, teclado, responsive y prevención de pérdida de cambios.
- [ ] Cubrir crear, editar, publicar, borrar, restaurar y subir medios.

### 3. Backend y dominio
- [ ] Consolidar contrato editorial y validaciones compartidas.
- [ ] Reducir los handlers a adaptadores HTTP.
- [ ] Revisar límites, errores, conflictos y cachés.
- [ ] Añadir pruebas de integración por endpoint y caso de uso.

### 4. Sitio público y contenido
- [ ] Revisar servicios de lectura, renderizado Markdown, medios y cachés.
- [ ] Verificar integridad de referencias entre juegos, reseñas y guías.
- [ ] Auditar rutas, metadatos SEO, estados 404 y rendimiento SSR.
- [ ] Documentar el contrato entre Netti y Contenido-Netti.

### 5. Calidad y mantenimiento
- [ ] Recuperar pruebas SSR, E2E, Axe y navegación por teclado de Legacy, adaptadas al código actual.
- [ ] Añadir pruebas de build y enlaces locales.
- [ ] Normalizar formato, lint y convenciones.
- [ ] Revisar dependencias y eliminar únicamente las que estén demostrablemente sin uso.
- [ ] Actualizar documentación de arquitectura y operación.

## Criterio de finalización

Una etapa se considera completa cuando sus flujos tienen pruebas automatizadas, CI pasa, no se degradan las funcionalidades existentes y la documentación coincide con el comportamiento real.

