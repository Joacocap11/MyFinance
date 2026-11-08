# MyFinance

MyFinance es una aplicación self-hosted para registrar ingresos y gastos y entender, en pocos segundos, en qué se fue el dinero. El resumen mensual, las categorías, la comparación con el mes anterior, los mayores gastos y la importación segura de movimientos bancarios funcionan por usuario autenticado.

No es un ERP ni un sistema contable. No incluye conversiones de moneda, integraciones bancarias ni inversiones.

## Funcionalidades

- Resumen mensual por moneda con ingresos, gastos, resultado, porcentaje gastado y comparación.
- Desglose por categorías, mayores gastos, evolución e insights matemáticos.
- Alta rápida de ingresos, gastos y transferencias entre cuentas de la misma moneda.
- Explorador de movimientos con filtros, búsqueda, edición y anulación histórica.
- Histórico de los últimos meses.
- Saldo histórico por cuenta y por fecha: saldo de apertura/cierre de cualquier día, evolución diaria y estadísticas (mínimo, máximo, variación neta) de un período.
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

- Aplicación web: `http://localhost:3000`
- API (solo desarrollo local): `http://localhost:8000`
- PostgreSQL: no tiene puerto publicado; solo `backend` accede a `db:5432`.

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
| `POSTGRES_PASSWORD` | Contraseña PostgreSQL | obligatorio |
| `DATABASE_URL` | URL SQLAlchemy del backend | `postgresql+psycopg://...@db:5432/...` |
| `JWT_SECRET` | Firma de tokens | obligatorio |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Duración del access token | `30` |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Duración del refresh token | `30` |
| `BACKEND_PORT` | Puerto local de FastAPI | `8000` |
| `FRONTEND_PORT` | Puerto local de nginx | `3000` |
| `VITE_API_BASE_URL` | Base API compilada en frontend | `/api/v1` |
| `CORS_ORIGINS` | Orígenes web permitidos, en JSON | `["http://localhost:3000","http://127.0.0.1:3000"]` |
| `LOG_LEVEL` | Nivel de logging | `INFO` |

Fuera de Compose, el backend admite PostgreSQL o SQLite para desarrollo/tests. Si no se define `DATABASE_URL`, usa `sqlite:///./myfinance.db`.

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

El seed es idempotente. En una instalación vacía no crea nada hasta que se registra el primer usuario; ese registro bootstrap crea el administrador, `Cuenta principal` y sus categorías. Los usuarios agregados por un administrador reciben las categorías iniciales, pero no cuentas financieras.

La migración `20260829_0008_multi_user_ownership` agrega `users.is_admin` y `owner_id` a las tablas financieras. En una base histórica con exactamente un usuario, conserva todos los registros y los asigna a ese usuario; aborta de forma transaccional si hay datos personales sin un único propietario inequívoco. Respaldá PostgreSQL antes de aplicar migraciones sobre datos reales.

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
- `backend/app/services/domain.py`: reglas de movimientos, transferencias y saldo (`account_balance`).
- `backend/app/services/analytics.py`: saldo histórico por cuenta y fecha (ver sección dedicada).
- `backend/app/services/`: reportes, categorías, reglas e importaciones.
- `backend/app/seed.py`: datos iniciales idempotentes.
- `backend/alembic/`: migraciones.

Comandos:

```powershell
Set-Location backend
uv run ruff format .
uv run ruff check .
uv run mypy app
uv run pytest
## Autenticación y alcance multiusuario

La primera instalación expone `POST /api/v1/auth/register` únicamente cuando no existe ningún usuario. Ese primer usuario es administrador. Después, solo un administrador puede crear usuarios desde Ajustes; no hay registro público abierto.

Cada registro financiero tiene `owner_id` y todas las consultas, escrituras, importaciones, reportes y búsquedas se filtran por el usuario del JWT. `ImportRow` no duplica propietario: hereda el alcance de su `ImportBatch`. Las cuentas, categorías, reglas, recurrentes, presupuestos y movimientos de un usuario nunca aparecen en otro usuario.

El administrador solo gestiona usuarios (alta, activación y permisos). No tiene acceso global a datos financieros. Las categorías iniciales se siembran por usuario; las cuentas no se comparten.


## Frontend

Rutas principales:

- `/`: Resumen.
- `/movimientos`: explorador y filtros.
- `/movimientos/nuevo`: alta rápida.
- `/historico`: evolución mensual.
- `/saldo-historico`: saldo histórico por cuenta y fecha, evolución y estadísticas.
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

## Saldo histórico

Responde con precisión preguntas como "¿cuánta plata tenía el 7 de octubre?" sin estimaciones ni IA: todo el cálculo vive en `backend/app/services/analytics.py` y reutiliza `services.domain.account_balance`, la misma función que ya expone el saldo actual de cada cuenta.

**Fórmula.** Para una cuenta y una fecha:

```text
saldo de cierre(fecha) = opening_balance de la cuenta
                        + Σ movimientos no anulados con date <= fecha
                        + Σ ajustes de conciliación con date <= fecha
saldo de apertura(fecha) = saldo de cierre(fecha - 1 día)
```

Un movimiento que afecta la cuenta suma (ingreso, o transferencia entrante) o resta (gasto, o transferencia saliente). Una transferencia es una única fila en `transactions` con `account_id` (origen) y `destination_account_id` (destino): resta del saldo de la cuenta origen y suma al saldo de la cuenta destino, por lo que el patrimonio conjunto de ambas cuentas no cambia, pero el saldo individual de cada una sí. El `date` de `transactions` (sin hora ni timezone) es la única fecha contable; varios movimientos del mismo día se agregan todos dentro de ese día.

**Endpoints** (requieren autenticación, igual que el resto de `/api/v1`):

- `GET /api/v1/analytics/balance-at-date?account_id=&date=&moment=closing|opening`: saldo de un día puntual, con el desglose de ingresos, gastos, transferencias entrantes/salientes, ajustes, variación neta y cantidad de movimientos.
- `GET /api/v1/analytics/balance-history?account_id=&date_from=&date_to=`: serie diaria de saldo de apertura/cierre. Los días sin movimientos repiten el saldo del día anterior (no hay huecos).
- `GET /api/v1/analytics/balance-summary?account_id=&date_from=&date_to=`: saldo inicial/final del período, saldo mínimo y máximo con su fecha, variación neta, y totales de ingresos/gastos/transferencias.

`balance-history` y `balance-summary` resuelven el período completo con dos consultas agregadas (movimientos y ajustes agrupados por fecha) más el saldo de arranque; no hay una consulta por día, por lo que el costo no crece con la cantidad de días solicitados.

**Alcance.** Los tres endpoints requieren `account_id`: no existe todavía un "patrimonio global" porque las cuentas pueden estar en monedas distintas (UYU/USD/UI) y sumarlas sin una tasa de conversión determinista daría un número engañoso. Queda documentado como una fase siguiente, a implementar si se agrega una tasa de conversión explícita y auditable.

**Frontend.** La página `/saldo-historico` permite elegir cuenta y fecha (con atajos Hoy/Ayer/Inicio de mes/Fin de mes pasado), muestra el saldo de cierre del día junto a su desglose, lista los movimientos de ese día (reutilizando el listado de movimientos existente) y grafica la evolución del saldo en un rango seleccionable (7 días, 30 días, mes actual, mes anterior o personalizado) junto con el saldo mínimo/máximo del período.

**Preparado para un asistente futuro.** `balance_at_date`, `balance_history`, `balance_summary`, `get_min_balance` y `get_max_balance` en `app/services/analytics.py` son funciones puras de backend (sin IA) pensadas para exponerse después como herramientas de un asistente local: siempre devuelven `Decimal`/`NUMERIC`, nunca estimaciones.

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

Los tests cubren las reglas de movimientos y transferencias, dinero decimal, anulaciones, cálculos mensuales, categorías, reglas de categorización, importación CSV, deduplicación, aislamiento por moneda y usuario, y saldo histórico (saldo de apertura/cierre, transferencias, huecos sin movimientos, mínimo/máximo del período y coincidencia exacta con el saldo actual). El frontend cubre los flujos críticos de resumen, alta rápida, evidencia de movimientos, importación y administración de usuarios.

## Seguridad y límites actuales
Todas las rutas financieras requieren autenticación; health, login y refresh son públicos. El registro solo funciona para bootstrap cuando todavía no existe ningún usuario. El administrador no obtiene acceso global a los datos financieros.

- No se versionan secretos ni `.env`.
- Los uploads CSV están limitados a 2 MiB y se validan en el servidor.
- SQLAlchemy usa consultas parametrizadas y Pydantic valida entradas.
- Las escrituras con un encabezado `Origin` ajeno a `CORS_ORIGINS` se rechazan antes de llegar a los handlers.
- La autenticación expone registro inicial, login, refresh y `/auth/me`; usar un `JWT_SECRET` aleatorio fuera de desarrollo.
- PostgreSQL no se publica en Compose; el acceso remoto esperado es mediante la red privada/WireGuard.
- UYU y USD se reportan por separado. No existen conversiones automáticas ni transferencias entre monedas.
- El saldo histórico es por cuenta; no existe un patrimonio global consolidado entre cuentas de distinta moneda (ver sección "Saldo histórico").
