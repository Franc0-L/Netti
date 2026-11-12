# Estimación de costos — Vercel Hobby + Neon Free

Este documento estima el costo mensual de operar Netti en el plan gratuito de Vercel (Hobby) y Neon (Free), basado en el uso esperado de un blog editorial de un solo autor en español.

## Resumen ejecutivo

| Servicio    | Plan  | Costo mensual estimado | Estado                      |
| ----------- | ----- | ---------------------- | --------------------------- |
| Vercel      | Hobby | $0 USD                 | Dentro de límites gratuitos |
| Neon        | Free  | $0 USD                 | Dentro de límites gratuitos |
| Vercel Blob | Hobby | $0 USD                 | Dentro de límites gratuitos |
| **Total**   |       | **$0 USD**             | **Sin costo mensual**       |

---

## 1. Vercel Hobby

### Límites del plan gratuito (a fecha de noviembre 2026)

| Recurso                 | Límite gratuito | Uso estimado Netti                               | Estado    |
| ----------------------- | --------------- | ------------------------------------------------ | --------- |
| Ancho de banda          | 100 GB/mes      | ~5-10 GB/mes (blog de texto + imágenes)          | ✅ Dentro |
| Funciones serverless    | 100 GB-h/mes    | ~5-20 GB-h/mes (pocas rutas dinámicas)           | ✅ Dentro |
| Cron jobs               | Ilimitados      | No se usan: el scheduler corre en GitHub Actions | N/A       |
| Dominio personalizado   | 1 dominio       | No aplica (usamos subdominio .vercel.app)        | N/A       |
| Construcciones (builds) | Ilimitadas      | 1-2 por semana (despliegues manuales)            | ✅ Dentro |

### Costo estimado

**$0 USD/mes** — todo el uso previsto está dentro de los límites gratuitos de Hobby.

> Nota: si en el futuro se agrega un dominio propio o se excede el ancho de banda, se aplicarán cargos por exceso. Por ahora no está planificado.

---

## 2. Neon Free

### Límites del plan gratuito (a fecha de noviembre 2026)

| Recurso                         | Límite gratuito            | Uso estimado Netti                                                 | Estado    |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------ | --------- |
| Almacenamiento                  | 3 GB                       | < 100 MB (10 tablas, pocos artículos)                              | ✅ Dentro |
| CU-horas                        | 4 CU-h/día (~100 CU-h/mes) | < 5 CU-h/mes (lecturas públicas en caché + escrituras ocasionales) | ✅ Dentro |
| Conexiones concurrentes         | 100                        | 2 por instancia (`DATABASE_POOL_MAX`, 1-10)                        | ✅ Dentro |
| Proyectos                       | 1                          | 1 proyecto (región `sa-east-1`)                                    | ✅ Dentro |
| Copias de seguridad automáticas | 7 días                     | Incluido                                                           | ✅ Dentro |

### Costo estimado

**$0 USD/mes** — todo el uso previsto está dentro de los límites gratuitos de Neon Free.

### Desglose de CU-horas

| Actividad                             | Frecuencia  | CU-h estimada por mes |
| ------------------------------------- | ----------- | --------------------- |
| Lecturas públicas (caché habilitada)  | Miles/mes   | ~1-3 CU-h             |
| Escrituras editoriales (panel)        | Docenas/mes | ~0.5 CU-h             |
| Revalidación programada (cada 30 min) | ~1,440/mes  | ~1-2 CU-h (a medir)   |
| Limpieza y reconciliación (diarias)   | ~60/mes     | ~0.1 CU-h             |
| Migraciones y backups                 | Mensual     | ~0.5 CU-h             |
| **Total estimado**                    |             | **~3-6 CU-h/mes**     |

Esto representa menos del 10% del límite gratuito de 100 CU-h/mes. La cifra de revalidación es una estimación: hay que medirla con el scheduler real porque cada ejecución despierta Neon.

---

## 3. Vercel Blob

### Límites del plan gratuito (Hobby)

| Recurso                  | Límite gratuito | Uso estimado Netti                        | Estado    |
| ------------------------ | --------------- | ----------------------------------------- | --------- |
| Almacenamiento           | 5 GB            | < 1 GB (imágenes de artículos, variantes) | ✅ Dentro |
| Operaciones de lectura   | 100,000/mes     | ~5,000-10,000/mes                         | ✅ Dentro |
| Operaciones de escritura | 10,000/mes      | ~100-500/mes                              | ✅ Dentro |
| Operaciones avanzadas    | 2,000/mes       | ~500-1,000/mes (list, CDN miss)           | ✅ Dentro |

### Costo estimado

**$0 USD/mes** — todo el uso previsto está dentro de los límites gratuitos.

---

## 4. Supuestos y restricciones

- **Un solo autor:** no hay múltiples editores generando escrituras constantes.
- **Lecturas públicas en caché:** `cacheComponents: true` activado, las visitas repetidas no despiertan Neon.
- **Imágenes optimizadas:** Sharp re-encodifica a WebP y genera variantes 480/960/1600, reduciendo tamaño y ancho de banda.
- **Sin comentarios ni cuentas de lectores:** reduce escrituras y lecturas de base de datos.
- **Región `sa-east-1`:** optimizada para Latinoamérica y España (público objetivo).

---

## 5. Riesgos de exceso de límites

| Riesgo                        | Probabilidad | Mitigación                                                                                                                |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Picos de tráfico inesperados  | Baja         | Caché de Vercel + cacheComponents reduce consultas a Neon                                                                 |
| Subida masiva de imágenes     | Muy baja     | Límite de 2 MB por archivo, validación de MIME y dimensiones                                                              |
| Cron ejecutándose con errores | Baja         | El endpoint de limpieza es idempotente y bounded (25 objetos por ejecución); `last_success_at` delata fallos persistentes |

---

## 6. Conclusión

Con el uso actual y esperado, Netti puede operar completamente dentro del plan gratuito de **Vercel Hobby + Neon Free + Vercel Blob**, con un costo mensual estimado de **$0 USD**.

Revisar esta estimación trimestralmente o si el tráfico crece significativamente.
