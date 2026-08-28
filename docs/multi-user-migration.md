# Runbook: migración multiusuario

Este procedimiento aplica a una instalación self-hosted existente. No reemplaza un backup verificado.

## Pre-migration

1. Detener escrituras: apagar frontend/backend o bloquear acceso privado durante la ventana.
2. Configurar `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` fuera de Git.
3. Crear un dump custom:

   ```sh
   ./scripts/backup_postgres.sh
   ```

4. Confirmar que el archivo existe, tiene tamaño mayor que cero y que `pg_restore --list archivo.dump` termina correctamente.
5. Guardar un snapshot financiero:

   ```sh
   python scripts/financial_snapshot.py --output snapshots/before.json --month YYYY-MM
   ```

6. Confirmar que existe un único usuario si hay datos financieros. La migración aborta de forma transaccional ante datos financieros con cero o múltiples usuarios.

## Migration

Con las escrituras detenidas:

```sh
cd backend
uv run alembic upgrade head
```

En Docker, el servicio backend aplica la migración antes de arrancar. La revisión esperada es `20260829_0008`.

La migración agrega `is_admin` y ownership a las entidades personales, conserva las filas y asigna los datos históricos al único usuario existente. No crea cuentas compartidas ni elimina datos.

## Post-migration

```sh
python scripts/check_owner_integrity.py --output snapshots/owner_integrity.json
python scripts/financial_snapshot.py --output snapshots/after.json --month YYYY-MM
```

Comparar `before.json` y `after.json`. Deben coincidir las cantidades, importes, saldos, monedas, movimientos anulados, recurrentes, presupuestos, importaciones y ajustes. Las únicas diferencias esperadas son `owner_id`, `is_admin` y tablas estrictamente de autenticación.

Después, ejecutar login, listado de cuentas, movimientos, reportes e importación con el administrador histórico y realizar una prueba de acceso cruzado con un segundo usuario.

## Rollback

La migración no tiene rollback operativo recomendado sobre la base en uso. Restaurar el dump en una base temporal para validar el backup y, si fuera imprescindible recuperar el estado anterior, reemplazar la base siguiendo el procedimiento de recuperación del operador. No ejecutar un `pg_restore --clean` contra producción sin una ventana aprobada y una copia adicional.

`restore_postgres.sh` usa por defecto `myfinance_restore_check` y rechaza destinos de producción ambiguos o bases no vacías sin confirmación explícita.
