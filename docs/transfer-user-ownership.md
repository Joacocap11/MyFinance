# Transferencia de ownership entre usuarios

La herramienta `scripts/transfer_user_ownership.py` es una operación administrativa local. No existe un endpoint público para transferir datos.

## Procedimiento

1. Hacer y verificar un backup de PostgreSQL.
2. Ejecutar el preflight sin escribir:

```bash
python scripts/transfer_user_ownership.py --from usuario-origen@example.com --to usuario-destino@example.com --dry-run
```

3. Revisar todas las cantidades y conflictos.
4. Ejecutar la misma operación con `--confirm`:

```bash
python scripts/transfer_user_ownership.py --from usuario-origen@example.com --to usuario-destino@example.com --confirm
```

`--from` y `--to` aceptan email exacto o ID numérico. El origen y destino deben ser usuarios distintos. Sin `--dry-run` ni `--confirm`, el comando solo imprime el plan y termina sin modificar datos.

## Alcance y seguridad

Se transfieren los registros con `owner_id` de:

- `accounts`
- `balance_adjustments`
- `categories`
- `transactions`
- `recurring_expenses`
- `categorization_rules`
- `monthly_budgets`
- `import_batches`

`import_rows` no tiene `owner_id`: pertenece a su `import_batch` y se transfiere indirectamente. El usuario origen nunca se elimina.

Antes de escribir se detectan conflictos que no se pueden resolver automáticamente: cuentas con el mismo nombre, categorías con el mismo `(kind, name, parent_id)` y presupuestos con la misma moneda. Cualquier conflicto aborta sin cambios; no se fusionan ni borran registros.

La escritura ocurre en una única transacción. Un error, una violación de integridad o un snapshot financiero distinto al inicial provoca rollback. Al finalizar se validan las relaciones owner entre transacciones, cuentas, categorías, gastos recurrentes, reglas e importaciones. El snapshot conjunto conserva cantidades y montos de transacciones y ajustes.

La herramienta no debe ejecutarse contra producción sin backup, revisión del dry-run y una ventana operativa controlada.
