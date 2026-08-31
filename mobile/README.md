# MyFinance Mobile

React Native + Expo + TypeScript client for the existing MyFinance FastAPI API. This app never connects to PostgreSQL and remains online-first.

## Setup

```sh
cd mobile
npm ci --legacy-peer-deps
cp .env.production.example .env
```
The Android production APK always uses the private LAN/WireGuard API:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.15:3000/api/v1
```
This URL is public build configuration, not a secret. Do not replace it with
`localhost`, `127.0.0.1`, `10.0.2.2`, or a public IP.

The phone must reach `192.168.1.15` through home Wi-Fi or WireGuard. The app
does not detect or configure VPN and the API is not exposed to the Internet.

The phone flow is:

```text
Celular
  ↓
Wi-Fi de casa o WireGuard
  ↓
192.168.1.15:3000/api/v1
  ↓
FastAPI
```

The first user is created through the bootstrap endpoint from the web/API, not from mobile.


## Run

Development commands:

```sh
npm start
npm run android
npm run ios
```

Build an installable Android APK without Expo Go or Metro:

```sh
npx eas-cli build --platform android --profile preview
```

The `preview` profile produces an APK and injects the private API URL at bundle time. The installed app runs standalone and stores its session with SecureStore.

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

## Biometría

La biometría queda deliberadamente fuera de esta subfase. `expo-local-authentication` no está instalado y agregarla requiere definir una preferencia opt-in, el comportamiento ante cambios de biometría y pruebas nativas separadas para Android/iOS. La sesión continúa protegida por SecureStore; no se usa biometría como reemplazo de JWT.

## API type generation

The current mobile layer keeps a small explicit type boundary in `src/api/types.ts`, matching the existing FastAPI OpenAPI contracts. This avoids adding a generator/runtime dependency while the API is still evolving. If the contract stabilizes, generate types reproducibly from the backend's `/openapi.json` and replace this boundary in one change.
