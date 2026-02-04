import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
    exclude: ['react-window'], // Exclure react-window de l'optimisation pour éviter les problèmes de cache
  },
  build: {
    // Optimisations pour la production
    minify: 'esbuild', // Minification rapide avec esbuild
    sourcemap: false, // Désactiver les source maps en production pour réduire la taille
    rollupOptions: {
      output: {
        // Code splitting manuel pour optimiser le chargement
        manualChunks: {
          // Séparer les dépendances lourdes
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
    // Augmenter la limite de taille des chunks pour éviter les warnings
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    allowedHosts: [
      'mtg-app.duckdns.org',
      'localhost',
      '.duckdns.org', // Permet tous les sous-domaines duckdns.org
    ],
  },
})
