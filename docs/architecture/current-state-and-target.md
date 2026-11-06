# Arquitectura de Netti: estado y dirección

## Objetivo

Mantener un sitio editorial de videojuegos con Astro SSR y un panel propio, con el contenido desacoplado en `Franc0-L/Contenido-Netti`. La prioridad es que cada responsabilidad tenga un lugar claro y que los flujos editoriales puedan probarse sin depender de GitHub o Vercel reales.

## Componentes y límites

- **Sitio Astro (`src/pages`, `src/components`, `src/layouts`)**: presentación pública, rutas y composición visual. No debe contener lógica de escritura editorial.
- **Dominio (`src/domain`)**: contratos, reglas y transformaciones que no dependen de HTTP, DOM ni GitHub. Los schemas editoriales deben ser la fuente de verdad compartida.
- **Servicios (`src/services`)**: lectura de contenido, búsqueda, medios y casos de uso que consumen el dominio.
- **API (`api/admin`)**: adaptadores HTTP finos. Validan método, sesión y origen; delegan las operaciones a casos de uso.
- **Infraestructura (`api/_lib`)**: adaptadores de GitHub, persistencia Markdown, sesión y transporte HTTP. No debe importar componentes de interfaz.
- **Panel (`public/admin`)**: interfaz del editor. Debe dividirse en módulos pequeños por responsabilidad (API client, navegación/listado, formularios, medios, papelera y vista previa).
- **Contenido (`Contenido-Netti`)**: Markdown, metadatos y medios editoriales. No contiene lógica de la aplicación ni secretos.

Esta es la dirección objetivo, no una orden de mover carpetas de inmediato. Los cambios estructurales se harán de forma incremental y con pruebas de regresión.

## Reglas de diseño

1. Una sola fuente de verdad para los tipos y reglas editoriales.
2. Los handlers HTTP no implementan reglas de negocio complejas.
3. El frontend nunca construye rutas de API de forma inconsistente; usa un cliente común.
4. El contenido editorial se trata como entrada no confiable, incluso cuando proviene del repositorio privado.
5. La vista previa nunca ejecuta HTML arbitrario ni URL con esquemas ejecutables.
6. Las operaciones de escritura deben ser explícitas, validadas y resistentes a conflictos de edición.
7. Cachés con TTL e invalidación documentada; evitar limpiar promesas en curso sin necesidad.
8. Cada flujo crítico debe tener pruebas unitarias, de integración y al menos una comprobación de extremo a extremo.

## Flujo editorial

1. El panel obtiene colecciones y entradas mediante `/api/admin/content`.
2. La API verifica sesión y origen para escrituras.
3. El caso de uso valida colección, metadatos y cuerpo contra el contrato editorial.
4. El adaptador GitHub lee o escribe Markdown en `Contenido-Netti`.
5. El repositorio de contenido activa su workflow de despliegue cuando cambian publicaciones o medios.
6. Astro sirve el contenido a través de sus servicios de lectura y caché.

## Calidad y pruebas

La CI debe ejecutar, como mínimo, chequeo de tipos, pruebas unitarias, pruebas de integración de API y build de producción. Las pruebas E2E, SSR, accesibilidad y rendimiento se incorporarán por etapas tras adaptar y verificar las pruebas heredadas de `Netti-Legacy`; no se copiarán a ciegas.

## Fuera de alcance de esta etapa

Las reglas de rate limiting y endurecimiento adicional del firewall quedan documentadas para una etapa posterior. No bloquean el trabajo actual de mantenibilidad y funcionalidad.
