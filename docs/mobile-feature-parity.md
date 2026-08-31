# Mobile / Web feature parity

Auditoría basada en las rutas de `frontend/src/App.tsx`, los contratos de `frontend/src/api/client.ts` y `backend/app/api.py`. Mobile comparte los endpoints de dominio; no duplica cálculos financieros.

| Funcionalidad | Web | Mobile | Estado |
|---|---:|---:|---|
| Login / sesión persistente | ✓ | ✓ | Web + Mobile |
| Registro | ✓ | — | Web only |
| Cambio de contraseña | ✓ | ✓ | Web + Mobile |
| Movimientos: listar/detalle | ✓ | ✓ | Web + Mobile |
| Movimientos: crear/editar/anular | ✓ | ✓ | Web + Mobile |
| Movimientos: filtros (mes, tipo, cuenta, categoría, búsqueda) | ✓ | ✓ | Web + Mobile |
| Cuentas: listar/crear/editar/archivar/reactivar | ✓ | ✓ | Web + Mobile |
| Cuentas: reconciliar saldo | ✓ | ✓ | Web + Mobile |
| Eliminar cuentas | ✓ | — | Web only; confirmación/errores 409 fuera de Mobile |
| Categorías: listar/crear/editar/archivar/reactivar | ✓ | ✓ | Web + Mobile |
| Categorías: subcategorías | ✓ | Parcial | Backend soporta parent_id; selector de padre aún no está expuesto |
| Reporte mensual | ✓ | ✓ | Web + Mobile |
| Histórico mensual por moneda | ✓ | ✓ | Web + Mobile |
| Gastos por categoría | ✓ | ✓ | Web + Mobile |
| Presupuestos mensuales | ✓ | ✓ | Web + Mobile |
| Gastos recurrentes: listar/activar/desactivar | ✓ | ✓ | Web + Mobile |
| Gastos recurrentes: crear/editar | ✓ | — | Web only; Mobile informa el límite actual |
| Reglas de categorización / autocategorización | ✓ | — | Web only |
| Administración de usuarios | ✓ | — | Web only; función administrativa no cotidiana |
| Importar CSV/XLSX | ✓ | **NO** | No aplicable Mobile |
| Backups, migraciones, tooling técnico | ✓ | **NO** | No aplicable Mobile |

## Decisiones financieras

- El Dashboard Mobile consulta `/reports/monthly?month=YYYY-MM&currency=...`.
- El backend calcula ingresos, gastos, categorías, movimientos anulados y jerarquías de categorías.
- Las categorías se agregan por categoría raíz, igual que Web.
- Mobile muestra UYU como moneda del Dashboard actual, igual que la versión previa; no suma UYU, USD y UI.
- La creación de cuentas usa `/settings/accounts` y `opening_balance`; el backend sigue siendo autoridad del saldo.
- No se crean movimientos manuales para representar el saldo inicial.

## Alcance de esta subfase

Implementado:

- detalle completo de movimiento, edición y anulación lógica con confirmación;
- filtros server-side de mes, tipo, cuenta, categoría y búsqueda;
- administración mobile de categorías activas/inactivas;
- reportes mensuales, gastos por categoría e histórico configurable por moneda;
- listado y activación/desactivación de gastos recurrentes;
- lectura y actualización de presupuesto mensual;
- reconciliación de saldo desde el detalle de cuenta;
- invalidación de movimientos, dashboard, cuentas y reportes después de mutaciones.

Limitaciones documentadas:

- el backend permite subcategorías (`parent_id`), pero Mobile aún no expone selector de padre;
- crear/editar recurrentes existe en backend/Web, pero Mobile solo administra reglas existentes;
- filtros de moneda/estado y rangos de fecha existen en la API/Web, pero no se muestran en la hoja mobile actual;
- el origen de importación se muestra solo si la API devuelve `category_source`.

Fuera de Mobile V2:

- importación CSV/XLSX;
- backups, migraciones, tooling técnico y administración de usuarios;
- eliminación de cuentas y reglas de categorización.

Mobile debe considerarse una superficie de administración financiera completa en evolución, no una versión lite. Cada incorporación futura debe reutilizar contratos y reglas del backend existentes.
