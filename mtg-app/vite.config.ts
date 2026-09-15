import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const pocketBaseUrl = (env.VITE_POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || '').trim()
  if (!pocketBaseUrl) {
    throw new Error(
      'VITE_POCKETBASE_URL is required. Copy .env.example to .env.local or set the variable at build time.'
    )
  }

  return {
    plugins: [
      react({
        jsxRuntime: 'automatic',
      }),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        manifest: {
          name: 'MTG Collection',
          short_name: 'MTG',
          description: 'Gérez votre collection de cartes Magic: The Gathering, créez des decks et suivez vos statistiques.',
          start_url: '/',
          display: 'standalone',
          theme_color: '#1e293b',
          background_color: '#0f172a',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /\/_\/.*/],
          runtimeCaching: [],
        },
        devOptions: { enabled: false },
      }),
    ],
    optimizeDeps: {
      exclude: ['react-window'],
    },
    build: {
      minify: 'esbuild',
      // Source maps "hidden" si Sentry est configuré (uploadables, non exposées au navigateur)
      sourcemap: Boolean(env.VITE_SENTRY_DSN?.trim()) ? 'hidden' : false,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port: 3000,
      strictPort: false,
      host: true,
      allowedHosts: [
        'mtg-app.duckdns.org',
        'localhost',
        '.duckdns.org',
      ],
      proxy: {
        '/scryfall-icons': {
          target: 'https://svgs.scryfall.io',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/scryfall-icons/, ''),
        },
      },
    },
  }
})
