# MyFinance Mobile

React Native + Expo + TypeScript client for the existing MyFinance FastAPI API. This app never connects to PostgreSQL and remains online-first.

## Setup

```sh
cd mobile
npm install
cp .env.example .env
```

Set `EXPO_PUBLIC_API_BASE_URL` to the API address reachable by the phone. Do not use `localhost` on a physical device:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.x.x.x:3000/api/v1
```

The phone flow is:

```text
Celular
  ↓
WireGuard
  ↓
IP privada Home Lab
  ↓
nginx/frontend
  ↓
/api/v1
  ↓
FastAPI
```

The first user is created through the bootstrap endpoint from the web/API, not from mobile.

## Run

```sh
npm start
npm run android
npm run ios
```

Scan the Expo QR code with Expo Go, or use an Android emulator/iOS simulator. The API URL is read once from Expo's public environment at bundle time.

Quality checks:

```sh
npm run lint
npm run typecheck
npm test
```

## API and session

`src/api/client.ts` is the only HTTP client. It sends Bearer access tokens, coordinates concurrent refresh requests, retries the original request once, and clears the session when refresh fails. Tokens are stored only with `expo-secure-store` (iOS Keychain / Android Keystore). Passwords and tokens are never displayed in the Más screen.

The dashboard, accounts, movements, categories and movement mutations use the same `/api/v1` endpoints as the web. Server state is cached with TanStack Query and invalidated after create, edit or void operations.

## Troubleshooting

- **VPN desconectada:** activá el túnel WireGuard y comprobá que el perfil correcto esté seleccionado.
- **Ruta WireGuard inexistente:** revisá `AllowedIPs` y la ruta hacia la IP privada del Home Lab. No cambies WireGuard desde la app.
- **API inaccesible:** desde el celular, comprobá que la URL configurada responda; el teléfono no puede usar `localhost` para llegar a tu computadora.
- **IP incorrecta:** usá la IP privada/VPN del Home Lab, no la IP pública ni la IP del loopback.
- **Puerto incorrecto:** verificá el puerto expuesto por nginx/frontend y que `EXPO_PUBLIC_API_BASE_URL` incluya `/api/v1`.
- **HTTP/HTTPS:** usá `https://` cuando nginx tenga TLS; en HTTP de desarrollo, confirmá las restricciones de cleartext del entorno.
- **Firewall:** permití el puerto en el servidor, la red Home Lab y el perfil WireGuard.
- **Token expirado:** el cliente intenta un refresh una sola vez; si falla, iniciá sesión nuevamente.
- **Servidor no disponible:** encendé la API y verificá `GET /api/v1/health` desde un dispositivo con acceso a la red.
- **Recarga de configuración:** cambios en `.env` requieren reiniciar Expo y reconstruir el bundle.

## API type generation

The current mobile layer keeps a small explicit type boundary in `src/api/types.ts`, matching the existing FastAPI OpenAPI contracts. This avoids adding a generator/runtime dependency while the API is still evolving. If the contract stabilizes, generate types reproducibly from the backend's `/openapi.json` and replace this boundary in one change.
