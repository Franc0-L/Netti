# Procedimiento de backup y restauración

## Alcance y límites

Estos scripts operan sobre PostgreSQL mediante las herramientas oficiales de línea de comandos. El backup usa exclusivamente `DATABASE_URL_UNPOOLED`. Los scripts cargan las variables locales desde `.env.local` mediante el cargador de entorno de Next.js. La restauración exige una variable independiente, `NETTI_RESTORE_DATABASE_URL`, y bloquea destinos remotos o bases cuyo nombre no termine en `_test`, `-test`, `_testing` o `-testing`.

La restauración automatizada está limitada deliberadamente a una base PostgreSQL local de pruebas. No existe un modo para restaurar sobre Neon ni producción. El dump no contiene objetos de Vercel Blob.

## Requisitos

- PostgreSQL 18 instalado localmente.
- `pg_dump` y `pg_restore` versión 18 o posterior disponibles en `PATH`.
- Node.js y dependencias del proyecto instaladas.
- `DATABASE_URL_UNPOOLED` apuntando a la base que se quiere respaldar.
- Una base local desechable para restauración, preferentemente `netti_restore_test`.
- Espacio libre suficiente para el dump y la base restaurada.

Comprobá los clientes:

```bash
pg_dump --version
pg_restore --version
```

Ambos deben informar PostgreSQL 18 o posterior. Un cliente más nuevo puede respaldar/restaurar servidores PostgreSQL de versiones anteriores compatibles; no uses un cliente más antiguo que el servidor.

## Crear un backup

Configurá `DATABASE_URL_UNPOOLED` en `.env.local` o en el entorno del proceso. El script no imprime la URL ni pasa la contraseña como argumento del proceso.

```bash
npm run db:backup
```

El archivo se crea en `backups/` con timestamp UTC y formato custom de PostgreSQL (`.dump`). El directorio está excluido de Git. El dump incluye esquema, datos, índices, constraints y objetos soportados por `pg_dump`, pero excluye los datos de `sessions` y `login_attempts`: las sesiones no deben sobrevivir a una recuperación y los intentos de login son datos operativos efímeros.

Validá el archivo inmediatamente:

```bash
pg_restore --list backups/<archivo>.dump
```

El comando debe terminar con código 0. Revisá también que el archivo exista y tenga un tamaño razonable. La lista del archivo comprueba que el catálogo custom se puede leer; no demuestra por sí sola que una restauración completa funcione.

## Restaurar en una base local de prueba

1. Creá una base local vacía y desechable, preferentemente `netti_restore_test`.
2. Definí `NETTI_RESTORE_DATABASE_URL` en el entorno del proceso apuntando a esa base. No reutilices `DATABASE_URL` ni `DATABASE_URL_UNPOOLED`.
3. Indicá el dump como argumento:

```powershell
$env:NETTI_RESTORE_DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/netti_restore_test'
npm run db:restore -- backups/<archivo>.dump
Remove-Item Env:NETTI_RESTORE_DATABASE_URL
```

El script ejecuta primero `pg_restore --list`. Solo después valida el destino y restaura con `--clean --if-exists --exit-on-error --single-transaction`. El destino debe estar en loopback y tener sufijo de test; si no cumple ambas condiciones, la restauración se cancela. El usuario PostgreSQL debe tener permisos para crear/modificar los objetos del esquema.

La restauración elimina/recrea objetos existentes dentro de la base destino. No apuntes a `netti_test` si querés conservar sus datos; usala únicamente si aceptás que sea sobrescrita. Al terminar, verificá manualmente las tablas y los datos esperados. Para una prueba completa, arrancá la aplicación contra la base restaurada y comprobá consultas de lectura y acceso al panel.

## Cifrado y custodia

El cifrado con `age` es opcional y se realiza después de validar el dump. Instalá `age` y cifrá con una clave pública bajo tu control:

```bash
age -r "$AGE_PUBLIC_KEY" -o backups/<archivo>.dump.age backups/<archivo>.dump
```

Conservá la clave privada fuera del repositorio y en un gestor seguro. Probá periódicamente el descifrado. Si se pierde la clave privada, el backup cifrado no se puede recuperar. No guardes claves privadas, tokens ni URLs con credenciales en GitHub.

## Frecuencia y retención recomendadas

- Antes de cada migración de esquema o cambio operativo de riesgo.
- Un backup diario mientras exista contenido editorial que no pueda reconstruirse.
- Una restauración de prueba mensual, en una base local desechable.
- Retención orientativa: 30 copias diarias y 12 mensuales, ajustada al espacio y a la política real de almacenamiento.

La carpeta local `backups/` no es un destino de recuperación ante pérdida o robo del equipo. Copiá los backups cifrados a un destino independiente con acceso restringido. No se configura en este PR ningún workflow programado ni almacenamiento remoto automático.

## Qué cubre y qué no cubre

| Datos | Cobertura |
| --- | --- |
| Artículos, juegos, medios y metadatos relacionales | PostgreSQL |
| Sesiones y registros de intentos de login | Se excluyen intencionalmente del dump |
| Archivos e imágenes almacenados en Vercel Blob | No incluidos; requieren estrategia de durabilidad/inventario separada |
| Variables, tokens y configuración de despliegue | No incluidos; deben custodiarse por separado |

## Recuperación ante incidente

1. Identificá el último dump íntegro y su clave de descifrado, si corresponde.
2. No restaures sobre producción desde estos scripts.
3. Descifrá el dump en un entorno seguro si está cifrado.
4. Restaurá primero en una base local de prueba siguiendo el procedimiento anterior.
5. Verificá tablas, conteos, constraints y lecturas representativas.
6. Planificá una recuperación de producción separada, revisada y autorizada. No improvises un `pg_restore --clean` contra una URL de producción.
