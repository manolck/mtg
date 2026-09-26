/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL: string;
  readonly VITE_PRICE_API_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ANALYTICS_ID?: string;
  readonly VITE_DEPLOY_HOOK_URL?: string;
  /** JSON array of RTCIceServer (STUN + TURN/coturn). See README.md */
  readonly VITE_ICE_SERVERS?: string;
  /** Play table WebSocket URL (e.g. wss://mtg-app.duckdns.org/play-ws). See README.md */
  readonly VITE_PLAY_WS_URL?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}




