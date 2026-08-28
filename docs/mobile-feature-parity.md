# Mobile / Web feature parity

Auditoría basada en las rutas de `frontend/src/App.tsx`, los contratos de `frontend/src/api/client.ts` y `backend/app/api.py`. Mobile comparte los endpoints de dominio; no duplica cálculos financieros.

| Funcionalidad | Web | Mobile | Próximo paso |
|---|---:|---:|---|
| Login | ✓ | ✓ | — |
| Registro | ✓ | — | Incorporar cuando el flujo de alta mobile sea prioritario |
| Recordar email | — | ✓ | Mobile usa `last_login_email`; nunca guarda password |
| Sesión persistente | ✓ | ✓ | — |
| Cambio de contraseña | ✓ | ✓ | — |
| Movimientos: listar/detalle | ✓ | ✓ | Agregar filtros mobile progresivamente |
| Movimientos: crear | ✓ | ✓ | — |
| Movimientos: editar/anular | ✓ | ✓ | — |
| Cuentas: listar/detalle | ✓ | ✓ | — |
| Cuentas: crear/editar | ✓ | ✓ | — |
| Cuentas: archivar/reactivar | ✓ | ✓ | — |
| Cuentas: reconciliar saldo | ✓ | — | Próxima iteración |
| Eliminar cuentas | ✓ | — | Mantener fuera hasta diseñar confirmación y errores 409 |
| Categorías: listar | ✓ | ✓ (selector de movimientos) | Administración pendiente |
| Categorías: crear/editar/archivar | ✓ | — | Próxima iteración |
| Reporte mensual | ✓ | ✓ | — |
| Histórico mensual | ✓ | ✓ (navegación en Inicio) | — |
| Gastos por categoría | ✓ | ✓ (top 5) | Pantalla “Ver todas” pendiente |
| Presupuestos | — / contrato backend existente | — | Auditar UX cuando exista pantalla Web |
| Recurrencias | ✓ | — | Próxima iteración |
| Reglas de categorización | ✓ | — | Próxima iteración |
| Autocategorización | ✓ | — | Próxima iteración |
| Administración de usuarios | ✓ | — | Solo rol administrador; evaluar UX mobile |
| Importar CSV/XLSX | ✓ | **NO** | Excepción explícita: queda en Web/Desktop |

## Decisiones financieras

- El Dashboard Mobile consulta `/reports/monthly?month=YYYY-MM&currency=...`.
- El backend calcula ingresos, gastos, categorías, movimientos anulados y jerarquías de categorías.
- Las categorías se agregan por categoría raíz, igual que Web.
- Mobile muestra UYU como moneda del Dashboard actual, igual que la versión previa; no suma UYU, USD y UI.
- La creación de cuentas usa `/settings/accounts` y `opening_balance`; el backend sigue siendo autoridad del saldo.
- No se crean movimientos manuales para representar el saldo inicial.

## Alcance de esta subfase

Implementado:

- email recordado separado de la sesión y sin credenciales;
- selector de mes anterior/siguiente con límite en el mes actual;
- acción “Mes actual” para volver rápidamente;
- eliminación del listado de cuentas del Dashboard;
- top 5 de gastos por categoría con importe y barra proporcional;
- estado vacío para meses sin gastos;
- CTA y formulario de nueva cuenta para UYU, USD y UI;
- edición de nombre y archive/reactivate desde detalle de cuenta.

No implementado en esta subfase:

- importación CSV/XLSX mobile;
- reconciliación de saldos;
- eliminación de cuentas;
- administración de categorías, reglas y recurrencias;
- filtros avanzados de movimientos;
- pantalla separada “Ver todas” para categorías.

Mobile debe considerarse una superficie de administración financiera completa en evolución, no una versión lite. Cada incorporación futura debe reutilizar contratos y reglas del backend existentes.
