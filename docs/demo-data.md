# Datos demo para Mobile V2

`seed_demo_data.py` es una herramienta exclusivamente de desarrollo. No se importa
ni se ejecuta desde el arranque del backend; `python -m app.seed` en Compose sigue
siendo únicamente el seed de categorías iniciales de la aplicación.

## Uso

Desde el checkout:

```powershell
python scripts/seed_demo_data.py --email usuario@example.com
python scripts/seed_demo_data.py --email usuario@example.com --months 6 --seed 123 --confirm
```

Dentro de Docker:

```sh
docker compose exec backend python scripts/seed_demo_data.py \
  --email usuario@example.com --months 12 --confirm
```

Parámetros:

- `--email` (obligatorio): usuario existente; el script nunca crea usuarios.
- `--months`: `6` o `12`; por defecto `12`, incluyendo el mes actual y meses anteriores.
- `--seed`: semilla de `random`; por defecto `42`. La misma semilla y rango generan los mismos valores.
- `--confirm`: obligatorio para escribir. Sin esta opción se muestra un dry-run y no se abre una transacción de escritura.
- `--reset-demo`: elimina únicamente movimientos con `origin_key` del namespace demo,
  reglas recurrentes/notas con prefijo `[DEMO]` y cuentas del namespace demo antes de recrear.
  Los presupuestos nunca se borran porque `MonthlyBudget` no tiene metadata de origen.

El entorno debe tener `ENVIRONMENT=development`, `local` o `test`. El script aborta
fuera de esos entornos. Compose usa `development` por defecto; una instalación de
producción debe definir explícitamente otro valor.

## Qué genera

- `[DEMO] Itaú UYU`, `[DEMO] Itaú USD`, `[DEMO] Ahorro BHU UI` y `[DEMO] Efectivo UYU`,
  con saldos iniciales mediante `Account.opening_balance`.
- Ingresos, gastos variados y transferencias UYU→USD/UI creados con
  `services.domain.create_transaction`, incluyendo `destination_amount` para monedas
  distintas.
- Categorías existentes/default de MyFinance; no crea categorías demo duplicadas.
- Cuatro reglas `RecurringExpense` demo y una conciliación demo.
- Un presupuesto mensual UYU si todavía no existe. El modelo actual admite un
  presupuesto por usuario/moneda, no uno por cada mes.
- Dos movimientos demo anulados mediante `void_transaction`.

Los movimientos se identifican técnicamente por `origin_key` con prefijo
`demo:mobile-v2:v1:` y llevan una nota técnica; los registros auxiliares visibles
usan `[DEMO]`. No se usan floats para dinero: todos los valores se construyen con
`Decimal` y se redondean a dos decimales con `ROUND_HALF_UP`.

## Advertencias

Ejecutar sólo contra una base local o temporal. El usuario debe existir previamente.
`--reset-demo` no toca movimientos normales del usuario y nunca elimina presupuestos;
si una cuenta demo aún tiene referencias no se elimina. No usar este comando contra
una base histórica o de producción.
