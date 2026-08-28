# Persistencia de sesiones

## Web

La pantalla de inicio de sesión ofrece **Mantener mi sesión iniciada**.

- Sin marcar: el token se guarda únicamente en `sessionStorage`.
- Marcada: el token se guarda únicamente en `localStorage`.
- La clave es `myfinance.session`; el valor contiene tokens JWT y el usuario, nunca la contraseña ni su hash.
- `frontend/src/api/client.ts` centraliza lectura, escritura, actualización y limpieza del almacenamiento.

Al arrancar la aplicación se carga el token almacenado y se valida con `GET /auth/me`. Si el access token expiró, el cliente intenta `POST /auth/refresh` y conserva el mismo tipo de almacenamiento. Los access tokens duran 30 minutos y los refresh tokens 30 días con la configuración actual.

Logout, expiración o refresh inválido eliminan ambas copias posibles y limpian la sesión en memoria. Cambiar la contraseña fuerza logout en la interfaz. La sesión temporal desaparece al cerrar la pestaña; la persistente permanece hasta logout, expiración o limpieza del navegador.

`localStorage` permite recordar la sesión, pero queda expuesto a JavaScript que se ejecute en el origen. La aplicación no usa cookies HttpOnly ni guarda contraseñas: mantener una política CSP/XSS estricta sigue siendo obligatorio.

## Mobile

Mobile usa `expo-secure-store` por defecto. Guarda solamente el objeto de sesión y restaura el token al iniciar. Las solicitudes protegidas, incluido `/auth/me`, intentan refresh una vez ante un `401`; un refresh inválido elimina SecureStore y notifica la expiración. El access token permanece solo en memoria fuera de esa persistencia segura.

No se implementan Redis, sesiones complejas ni endpoints públicos adicionales.
