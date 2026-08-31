# Exportación CSV portable (Web)

## Objetivo

La exportación CSV permite transportar los movimientos de una cuenta entre instalaciones de MyFinance e importar el archivo desde **Importar CSV**. No es un backup de PostgreSQL: no incluye usuarios, configuración, IDs internos ni el estado completo de la instalación.

## Formato

- UTF-8, con encabezados y escapado CSV estándar.
- Fechas en `YYYY-MM-DD`.
- Importes decimales con punto y hasta dos decimales; no dependen del locale.
- `myfinance_format_version` identifica el formato nativo; actualmente es `1`.
- Columnas: `myfinance_format_version`, `date`, `description`, `kind`, `amount`, `currency`, `account_name`, `account_currency`, `category`, `destination_account`, `destination_currency`, `destination_amount`, `purpose`, `status`, `notes`.
- Las categorías se representan por ruta (`Padre > Hija`), nunca por ID.

## Transferencias y compatibilidad

Las transferencias conservan tipo, cuenta destino, moneda destino, importe destino y propósito. Al importar, la cuenta destino debe existir en la instalación destino con el mismo nombre; la cuenta origen se elige en la vista previa. Las categorías se resuelven por nombre y jerarquía en la cuenta del usuario destino. Si no se encuentra una categoría, la fila queda sin categoría y puede revisarse en la vista previa.

El importador existente sigue aceptando CSV bancarios/genéricos y sus fechas, importes firmados, columnas débito/crédito, reglas de categorización, vista previa y deduplicación. Los CSV nativos no transportan IDs internos.

## Limitaciones explícitas

- La primera versión exporta todos los movimientos de la cuenta seleccionada.
- Los movimientos anulados se excluyen; el export representa movimientos activos.
- El saldo inicial y los ajustes de conciliación no forman parte del CSV de movimientos. Deben configurarse/conciliarse por separado en la instalación destino.
- No se exportan otras cuentas salvo que aparezcan como destino de una transferencia.
- La descarga y esta funcionalidad son Web-only; Mobile no participa.

Para recuperación integral usar un backup de PostgreSQL. El CSV sirve para portabilidad, análisis y migración de movimientos/cuentas, no para recuperación completa.
