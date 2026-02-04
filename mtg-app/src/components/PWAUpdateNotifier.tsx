import { useEffect } from 'react'
import { useToast } from '../context/ToastContext'

export function PWAUpdateNotifier() {
  const { showInfo } = useToast()

  useEffect(() => {
    const onNeedRefresh = () => {
      showInfo('Nouvelle version disponible. Rechargez la page pour mettre à jour.', 20000)
    }
    const onOfflineReady = () => {
      showInfo('Application prête pour une utilisation hors ligne.', 8000)
    }
    window.addEventListener('pwa-need-refresh', onNeedRefresh)
    window.addEventListener('pwa-offline-ready', onOfflineReady)
    return () => {
      window.removeEventListener('pwa-need-refresh', onNeedRefresh)
      window.removeEventListener('pwa-offline-ready', onOfflineReady)
    }
  }, [showInfo])

  return null
}
