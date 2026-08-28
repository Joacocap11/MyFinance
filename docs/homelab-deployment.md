# Despliegue en Home Lab

## Arquitectura

Proxmox aloja una VM/LXC para MyFinance. Docker Compose ejecuta `frontend`, `backend` y `db` (PostgreSQL). `db` usa el volumen persistente `postgres_data`; no se publica el puerto 5432. Solo `backend` accede a PostgreSQL por la red interna de Compose.

## Instalación

```sh
git clone <repositorio> MyFinance
cd MyFinance
cp .env.example .env
```

Editar `.env`: establecer una contraseña PostgreSQL fuerte, un `JWT_SECRET` aleatorio largo, `CORS_ORIGINS` y los puertos/IP que se usarán por la red privada. Para acceso desde WireGuard, la URL que usa el navegador/teléfono debe ser la IP privada de la VM/LXC; el frontend Docker sigue usando `/api/v1` y nginx hace proxy al backend.

```sh
docker compose build
docker compose up -d
docker compose ps
curl http://127.0.0.1:3000/api/v1/health
```
En una instalación Compose, copiar primero la base al contenedor backend y ejecutar allí (el hostname `db` solo existe dentro de Compose):

```sh
docker compose cp backend/myfinance.db backend:/tmp/myfinance.db
docker compose exec backend python scripts/migrate_sqlite_to_postgres.py \
  --sqlite /tmp/myfinance.db
```

El script aborta si una tabla destino ya contiene filas. No elimina ni modifica SQLite. Revisar el resumen de conteos y hacer una copia de seguridad antes de repetir una operación. El archivo `myfinance.sql` si existe en el checkout es un artefacto del usuario y no se importa automáticamente.

## Backup y restore

Desde el contenedor backend (que tiene acceso a `db`) generar el dump y copiarlo al host:

```sh
docker compose exec backend sh -c \
  'BACKUP_DIR=/tmp/backups scripts/backup_postgres.sh'
mkdir -p backups
docker compose cp backend:/tmp/backups/. backups/
```

En producción se recomienda ejecutar el script desde un contenedor/host con acceso a `db` y copiar los archivos resultantes fuera de la VM. `backups/` está excluido de Git.

Restaurar un dump plain comprimido sobre una base vacía (sin publicar 5432):

```sh
docker compose cp backups/myfinance_YYYY-MM-DD_HHMM.sql.gz db:/tmp/restore.sql.gz
docker compose exec db sh -c \
  'gunzip -c /tmp/restore.sql.gz | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Para restaurar de forma segura, detener el backend, crear/restaurar una base vacía, ejecutar `alembic upgrade head` si el dump no contiene esquema, y verificar `/api/v1/health` antes de reanudar tráfico.

## Red

El flujo esperado es `cliente WireGuard -> IP privada de la VM/LXC -> frontend -> backend -> PostgreSQL`. Mantener PostgreSQL sin `ports`, limitar los puertos publicados del frontend/backend al host privado y no abrirlos en Internet.
