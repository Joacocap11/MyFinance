# Consumo de la API desde mobile

La aplicación móvil debe consumir la misma API que la web; nunca debe conectarse a PostgreSQL.

## URL base

- Desarrollo local: `http://localhost:8000/api/v1`
- Docker detrás de nginx: `http://<ip-privada-o-vpn>:3000/api/v1`
- Si se publica el backend directamente en la red privada: `http://<ip-privada-o-vpn>:8000/api/v1`

En React Native/Expo, guardar la URL en una variable de entorno de build (por ejemplo `EXPO_PUBLIC_API_BASE_URL`). No usar `localhost` desde un teléfono físico: allí `localhost` es el propio teléfono.

## Autenticación

Crear la cuenta inicial con `POST /auth/register`. El endpoint solo está habilitado mientras no exista ningún usuario en la instalación: la primera solicitud devuelve `201` y las siguientes devuelven `403`. No es un sistema de invitaciones ni un registro público permanente.

```json
POST /auth/login
{"email":"persona@example.com","password":"una-clave-larga"}
```

La respuesta contiene `access_token`, `refresh_token`, `token_type` y `expires_in`. Enviar el access token como `Authorization: Bearer <token>`. Guardar los tokens en almacenamiento seguro del dispositivo; no en AsyncStorage sin cifrado.

Cuando expire el access token:

```json
POST /auth/refresh
{"refresh_token":"..."}
```

Usar el nuevo par de tokens. `GET /auth/me` valida la sesión actual. Los secretos JWT solo viven en el backend mediante `JWT_SECRET`.

## Operaciones principales

- `GET /settings/accounts` — listar cuentas.
- `GET /settings/accounts/{id}` — detalle y saldo calculado.
- `POST /settings/accounts` — crear cuenta.
- `PATCH /settings/accounts/{id}` — actualizar cuenta.
- `GET /transactions` — listar con filtros y paginación.
- `POST /transactions` — crear ingreso, gasto o transferencia.
- `PATCH /transactions/{id}` — editar movimiento.
- `POST /transactions/{id}/void` — anular sin borrar historial.
- `GET /settings/categories` — listar categorías.
- `POST/PATCH /settings/categories` — administrar categorías.
- `GET /reports/monthly?month=2026-08&currency=UYU` — resumen mensual.
- `GET /reports/history?currency=UYU&months=12` — serie histórica.
- `GET /health` — disponibilidad de API y base de datos.

Ejemplo de gasto:

```json
POST /transactions
{"date":"2026-08-28","kind":"expense","amount":"1250.00","description":"Supermercado","account_id":1,"category_id":4}
```

Los montos son decimales; tratarlos como strings/Decimal en el cliente, nunca como cálculos binarios con `float`.

## Errores

La API devuelve JSON `{ "detail": "..." }`. Interpretar `401` como sesión expirada, `403` como acceso no permitido, `404` como recurso inexistente, `409` como conflicto de datos y `422` como validación del request. Ante `5xx`, reintentar solo operaciones idempotentes.

## Home Lab y WireGuard

El teléfono se conecta por WireGuard a la red privada del Home Lab y usa la IP privada de la VM/LXC en la URL base. WireGuard, DNS y firewall son infraestructura externa a este proyecto. No exponer el puerto 5432; PostgreSQL solo es accesible desde la red interna de Compose.
