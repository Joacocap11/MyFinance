# Administración de usuarios

## Bootstrap

En una instalación sin usuarios, `/registro` permite crear el primer usuario administrador. Ese usuario recibe las categorías iniciales y una cuenta principal. Cuando ya existe un usuario, el registro público responde que el bootstrap terminó.

## Alta de usuarios

Un administrador entra en **Ajustes → Usuarios**, crea el usuario y define su contraseña inicial. El nuevo usuario recibe categorías iniciales, pero crea sus propias cuentas financieras.

## Estado y permisos

- Un administrador puede listar usuarios y activar o desactivar usuarios.
- Un administrador no obtiene acceso global a cuentas, movimientos, reportes o importaciones ajenos.
- Un usuario normal no puede listar, crear ni modificar usuarios.
- El sistema impide quitarse permisos o desactivarse si eso dejaría cero administradores activos.
- Un usuario inactivo no puede iniciar sesión ni renovar un refresh token.
- El ownership se toma exclusivamente del JWT validado; `owner_id` no es un campo writable de los clientes.

## Alcance actual

Cada usuario tiene datos financieros completamente separados. No existen cuentas compartidas, miembros por cuenta, invitaciones, permisos por cuenta, recuperación de contraseña, 2FA, OAuth ni sincronización offline. Tampoco se implementan cuentas de pareja/familia.
