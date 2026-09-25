/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL: string;
  readonly VITE_PRICE_API_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ANALYTICS_ID?: string;
  readonly VITE_DEPLOY_HOOK_URL?: string;
  /** JSON array of RTCIceServer (STUN + TURN/coturn). See docs/WEBRTC_TURN_SETUP.md */
  readonly VITE_ICE_SERVERS?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}




