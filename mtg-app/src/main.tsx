import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
