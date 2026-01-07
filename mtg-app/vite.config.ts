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
