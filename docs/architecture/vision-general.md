# Visión general del sistema — Netti

Netti es un blog editorial de videojuegos construido con **Astro SSR** y adaptador de **Vercel**. El contenido editorial vive en un repositorio separado y privado (`Contenido-Netti`) y se consume a través de la API de GitHub en cada request del servidor.

## Arquitectura de alto nivel

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

## Principios de diseño

1. **Dos repositorios**: El sitio público (`Netti`) y el contenido (`Contenido-Netti`) viven en repositorios separados. El contenido es privado y solo accesible con token de GitHub.
2. **SSR (Server-Side Rendering)**: Todas las páginas se renderizan en el servidor en cada request, leyendo el contenido fresco desde GitHub.
3. **Panel editorial propio**: El sitio incluye un panel de administración (`/admin/`) que permite crear, editar y eliminar artículos directamente desde el navegador, escribiendo de vuelta al repositorio de contenido vía API de GitHub.
4. **Medios servidos por el sitio**: Las imágenes del repositorio privado se sirven a través del endpoint `/media/...` de Netti, que descarga el archivo con el token del servidor y lo devuelve al navegador sin exponer el token.

## Stack tecnológico

- **Framework**: Astro v7 con adaptador de Vercel (`output: "server"`)
- **Lenguaje**: TypeScript (estricto) + Astro (`.astro`)
- **Validación de contenido**: Zod schemas compartidos entre sitio y panel
- **Markdown**: `marked` con `rehype-sanitize` y `rehype-raw`
- **Estilos**: CSS custom properties, tema oscuro, fuente Quicksand
- **Despliegue**: Vercel (serverless functions para las APIs del panel)
- **Contenido**: Repositorio privado de GitHub con archivos `.md` (frontmatter YAML + cuerpo Markdown)
