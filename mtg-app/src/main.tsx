import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Enregistrer le Service Worker en production (PWA)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent('pwa-need-refresh'))
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent('pwa-offline-ready'))
      },
    })
    ;(window as { __updateSW?: (reload?: boolean) => Promise<void> }).__updateSW = updateSW
  })
}

// Initialiser le mode dark au chargement
const savedDarkMode = localStorage.getItem('darkMode');
if (savedDarkMode === 'true') {
  document.documentElement.classList.add('dark');
} else if (savedDarkMode === null) {
  // Si aucune préférence sauvegardée, utiliser la préférence système
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
