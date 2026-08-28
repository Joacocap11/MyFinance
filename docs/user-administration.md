# Administración de usuarios

En una instalación sin usuarios, `/register` permite crear el primer usuario administrador. El registro público permanece disponible mientras haya menos de `MAX_USERS` usuarios. El valor predeterminado es `5` y puede cambiarse mediante la variable de entorno `MAX_USERS` en `.env` o Compose.

El endpoint público `GET /api/v1/auth/registration-status` informa si el registro está habilitado, la cantidad actual, el máximo y los cupos restantes. No expone datos personales.

El primer usuario recibe categorías iniciales y no recibe cuentas financieras automáticamente. Cada usuario posterior se crea como usuario normal, recibe sus propias categorías iniciales y comienza sin cuentas ni movimientos. El límite se aplica dentro de una transacción protegida contra registros concurrentes.

Cuando se alcanza el máximo, `/register` sigue siendo accesible y muestra `Se alcanzó el límite máximo de cuentas de esta instalación.` El formulario queda deshabilitado. El backend rechaza igualmente llamadas directas a `POST /api/v1/auth/register` con `409 Conflict`.

El registro público no permite enviar `is_admin` ni `owner_id`. El primer usuario recibe `is_admin=true`; todos los siguientes reciben `is_admin=false`.

Un administrador entra en **Ajustes → Usuarios**, crea el usuario y define su contraseña inicial. Este mecanismo se mantiene como alternativa al auto-registro. El nuevo usuario recibe categorías iniciales, pero crea sus propias cuentas financieras.

## Estado y permisos

- Un administrador puede listar usuarios y activar o desactivar usuarios.
- Un administrador no obtiene acceso global a cuentas, movimientos, reportes o importaciones ajenos.

- Un usuario normal no puede listar, crear ni modificar usuarios.
- El sistema impide quitarse permisos o desactivarse si eso dejaría cero administradores activos.
- Un usuario inactivo no puede iniciar sesión ni renovar un refresh token.
- El ownership se toma exclusivamente del JWT validado; `owner_id` no es un campo writable de los clientes.

## Seguridad de credenciales

Las contraseñas se almacenan únicamente como hashes `scrypt`, con salt aleatorio de 16 bytes y parámetros `n=2**14`, `r=8`, `p=1`. La política predeterminada exige `MIN_PASSWORD_LENGTH=10`; acepta passphrases largas y no impone combinaciones artificiales de caracteres.

Cada usuario puede cambiar su contraseña desde **Ajustes → Seguridad** mediante `POST /api/v1/auth/change-password`. Se verifica la contraseña actual y se genera un hash nuevo. Tras el cambio, la sesión web se cierra y se debe iniciar sesión nuevamente.

La implementación JWT actual no mantiene estado de revocación. Por lo tanto, tokens emitidos antes del cambio pueden continuar válidos hasta su expiración si se conservan fuera del cliente que cerró sesión. No se agregan Redis ni estado server-side en esta fase.

## Alcance actual

Cada usuario tiene datos financieros completamente separados. No existen cuentas compartidas, miembros por cuenta, invitaciones, permisos por cuenta, recuperación de contraseña, 2FA, OAuth ni sincronización offline. Tampoco se implementan cuentas de pareja/familia.
