# MyFinance

MyFinance es una aplicación personal para registrar ingresos y gastos y entender, en pocos segundos, en qué se fue el dinero. Está diseñada para una sola persona y prioriza el resumen mensual, las categorías, la comparación con el mes anterior, los mayores gastos y la importación segura de movimientos bancarios.

No es un ERP ni un sistema contable. No incluye conversiones de moneda, integraciones bancarias, inversiones, roles ni multi-tenancy.

## Funcionalidades

- Resumen mensual por moneda con ingresos, gastos, resultado, porcentaje gastado y comparación.
- Desglose por categorías, mayores gastos, evolución e insights matemáticos.
- Alta rápida de ingresos, gastos y transferencias entre cuentas de la misma moneda.
- Explorador de movimientos con filtros, búsqueda, edición y anulación histórica.
- Histórico de los últimos meses.
- Cuentas UYU/USD sin mezclar monedas ni realizar conversiones.
- Categorías configurables y subcategorías para analizar el costo del auto.
- Definiciones de gastos recurrentes, sin generar movimientos automáticamente.
- Presupuesto mensual general por moneda.
- Reglas deterministas de categorización por texto.
- Importación CSV con mapeo de columnas, preview, categorización, revisión de duplicados y confirmación atómica.

## Arquitectura

```text
MyFinance/
├── backend/        FastAPI, SQLAlchemy 2, Alembic y pytest
├── frontend/       React, TypeScript, Vite, Recharts y Vitest
├── compose.yaml    PostgreSQL, backend y frontend/nginx
└── .env.example    Configuración de Docker Compose
```

El backend concentra las reglas financieras y los cálculos. Los importes se guardan como `NUMERIC(14,2)` y se entregan por API como strings decimales; el frontend no recalcula totales financieros. Las transferencias no cuentan como ingresos ni gastos. Los movimientos anulados se conservan para auditoría, pero no afectan balances ni reportes.

## Requisitos

### Desarrollo local

- Git.
- [uv](https://docs.astral.sh/uv/) para Python y dependencias del backend.
- Node.js 24 LTS y npm.

No hace falta instalar Python manualmente: `uv` descarga una versión compatible. El backend local usa SQLite de forma predeterminada, por lo que PostgreSQL no es obligatorio para desarrollar.

### Docker

- Docker Desktop para Windows con contenedores Linux.
- Docker Compose v2 o posterior (`docker compose`).

## Instalación local en Windows

Todos los comandos siguientes se ejecutan desde PowerShell.

```powershell
git clone https://github.com/Joacocap11/MyFinance.git
Set-Location MyFinance
```

### Backend

```powershell
Set-Location backend
uv sync --all-groups
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.main:app --reload --port 8000
```

La API queda en `http://localhost:8000`, su documentación OpenAPI en `http://localhost:8000/docs` y la comprobación de salud en `http://localhost:8000/api/v1/health`.

### Frontend

En otra terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

La aplicación queda en `http://localhost:5173`. Vite redirige `/api` hacia `http://localhost:8000`.

## Ejecución con Docker

1. Inicia Docker Desktop y espera a que el motor esté listo.
2. Copia la configuración y cambia la contraseña local:

```powershell
Copy-Item .env.example .env
```

3. Levanta el stack:

```powershell
docker compose up --build
```

Servicios:

- Aplicación: `http://localhost:3000`
- API: `http://localhost:8000`
- PostgreSQL: `127.0.0.1:5432`

El backend espera el healthcheck de PostgreSQL, aplica las migraciones y ejecuta el seed idempotente antes de iniciar. Los datos quedan en el volumen `postgres_data`.

Para detenerlo:

```powershell
docker compose down
```

Para detenerlo y eliminar también la base local de Docker:

```powershell
docker compose down --volumes
```

Este último comando elimina datos y debe usarse solo cuando realmente se quiera reiniciar la base.

## Variables de entorno

Copia `.env.example` a `.env`; `.env` está excluido de Git.

| Variable | Uso | Predeterminado |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | Nombre del proyecto Compose | `myfinance` |
| `POSTGRES_DB` | Base PostgreSQL | `myfinance` |
| `POSTGRES_USER` | Usuario PostgreSQL local | `myfinance` |
| `POSTGRES_PASSWORD` | Contraseña PostgreSQL | placeholder de desarrollo |
| `POSTGRES_PORT` | Puerto local de PostgreSQL | `5432` |
| `BACKEND_PORT` | Puerto local de FastAPI | `8000` |
| `FRONTEND_PORT` | Puerto local de nginx | `3000` |
| `CORS_ORIGINS` | Orígenes web permitidos, en JSON | `["http://localhost:3000","http://127.0.0.1:3000"]` |
| `LOG_LEVEL` | Nivel de logging | `INFO` |

Fuera de Compose, el backend también admite `DATABASE_URL`. Si no está definida usa `sqlite:///./myfinance.db`.

Ejemplo PostgreSQL:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://myfinance:contraseña@localhost:5432/myfinance"
```

## Migraciones y datos iniciales

Alembic es la única vía para modificar el esquema; la aplicación no ejecuta `create_all` al arrancar.

```powershell
Set-Location backend
uv run alembic upgrade head
uv run alembic current
uv run alembic history
```

Después de migrar:

```powershell
uv run python -m app.seed
```

El seed puede ejecutarse varias veces sin duplicar datos. Crea `Cuenta principal`, las categorías personales iniciales, las subcategorías del auto y las categorías de ingreso.

Para generar una migración después de cambiar modelos:

```powershell
uv run alembic revision --autogenerate -m "descripción del cambio"
```

Revisa siempre la migración generada antes de aplicarla.

## Backend

Código principal:

- `backend/app/main.py`: aplicación FastAPI, CORS, logging y errores globales.
- `backend/app/api.py`: endpoints bajo `/api/v1`.
- `backend/app/models.py`: modelos y restricciones de base de datos.
- `backend/app/schemas.py`: validación y contratos JSON.
- `backend/app/services/`: movimientos, reportes, categorías, reglas e importaciones.
- `backend/app/seed.py`: datos iniciales idempotentes.
- `backend/alembic/`: migraciones.

Comandos:

```powershell
Set-Location backend
uv run ruff format .
uv run ruff check .
uv run mypy app
uv run pytest
```

## Frontend

Rutas principales:

- `/`: Resumen.
- `/movimientos`: explorador y filtros.
- `/movimientos/nuevo`: alta rápida.
- `/historico`: evolución mensual.
- `/importar`: importación CSV.
- `/ajustes`: cuentas, categorías, reglas, recurrentes y presupuesto.

Comandos:

```powershell
Set-Location frontend
npm run dev
npm run format
npm run lint
npm run test
npm run build
```

## Importación CSV

La importación nunca crea movimientos al subir el archivo. El flujo es:

1. Seleccionar una cuenta y subir un `.csv` de hasta 2 MiB.
2. Mapear fecha, descripción e importe; también se admiten columnas separadas de débito/crédito y una columna de tipo.
3. Revisar el preview, errores, categorías sugeridas y posibles duplicados.
4. Elegir importar u omitir las coincidencias ambiguas.
5. Confirmar. La confirmación es atómica e idempotente.

Se aceptan fechas comunes como `AAAA-MM-DD`, `DD/MM/AAAA` y `DD-MM-AAAA`. El servidor normaliza importes con coma o punto decimal. Una coincidencia exacta de origen impide reimportar la misma fila; una coincidencia semántica solo se marca para revisión porque dos compras iguales pueden ser legítimas.

## Pruebas y calidad

Backend:

```powershell
Set-Location backend
uv run pytest
uv run ruff check .
uv run mypy app
```

Frontend:

```powershell
Set-Location frontend
npm run test
npm run format:check
npm run lint
npm run build
```

Docker Compose:

```powershell
docker compose config
```

Los tests cubren las reglas de movimientos y transferencias, dinero decimal, anulaciones, cálculos mensuales, categorías, reglas de categorización, importación CSV, deduplicación y aislamiento por moneda. El frontend cubre los flujos críticos de resumen, alta rápida, evidencia de movimientos e importación.

## Seguridad y límites actuales

- No se versionan secretos ni `.env`.
- Los uploads CSV están limitados a 2 MiB y se validan en el servidor.
- SQLAlchemy usa consultas parametrizadas y Pydantic valida entradas.
- Las escrituras con un encabezado `Origin` ajeno a `CORS_ORIGINS` se rechazan antes de llegar a los handlers.
- MyFinance no incorpora autenticación porque está pensada para uso personal local. Los puertos de Compose se publican solo en `127.0.0.1`; no expongas la aplicación directamente a Internet.
- UYU y USD se reportan por separado. No existen conversiones automáticas ni transferencias entre monedas.
