import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
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
