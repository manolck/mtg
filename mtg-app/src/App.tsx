import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { AdminRoute } from './components/Layout/AdminRoute';
import { Navbar } from './components/Layout/Navbar';
import { Spinner } from './components/UI/Spinner';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { GDPRConsent } from './components/Legal/GDPRConsent';

// Lazy load des routes principales pour réduire le bundle initial
// Cela permet de charger uniquement le code nécessaire pour chaque route
const Collection = lazy(() => import('./pages/Collection').then(module => ({ default: module.Collection })));
const CommunityDecks = lazy(() => import('./pages/CommunityDecks').then(module => ({ default: module.CommunityDecks })));
const Decks = lazy(() => import('./pages/Decks').then(module => ({ default: module.Decks })));
const DeckBuilder = lazy(() => import('./pages/DeckBuilder').then(module => ({ default: module.DeckBuilder })));
const Profile = lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const Admin = lazy(() => import('./pages/Admin').then(module => ({ default: module.Admin })));
const Statistics = lazy(() => import('./pages/Statistics').then(module => ({ default: module.Statistics })));
const Wishlist = lazy(() => import('./pages/Wishlist').then(module => ({ default: module.Wishlist })));
const Scan = lazy(() => import('./pages/Scan').then(module => ({ default: module.Scan })));
const ScanCompare = lazy(() => import('./pages/ScanCompare').then(module => ({ default: module.ScanCompare })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then(module => ({ default: module.PrivacyPolicy })));
const PlayLobbies = lazy(() => import('./pages/PlayLobbies').then(module => ({ default: module.PlayLobbies })));
const PlayLobby = lazy(() => import('./pages/PlayLobby').then(module => ({ default: module.PlayLobby })));
const PlayTable = lazy(() => import('./pages/PlayTable').then(module => ({ default: module.PlayTable })));
import { setErrorToastCallback } from './services/errorHandler';
import { useToast } from './context/ToastContext';
import { PWAUpdateNotifier } from './components/PWAUpdateNotifier';
import { useEffect } from 'react';
import { initializeMTGJSONPrices, shouldUpdatePrices, updateMTGJSONPrices } from './services/mtgjsonPriceServiceAPI';

function ErrorHandlerInitializer() {
  const { showError } = useToast();

  useEffect(() => {
    setErrorToastCallback(showError);
  }, [showError]);

  return null;
}

function MTGJSONInitializer() {
  useEffect(() => {
    let mounted = true;
    
    // Initialiser MTGJSON au démarrage de l'application
    // Charge d'abord depuis le cache (rapide), puis met à jour en arrière-plan si nécessaire (> 2 mois)
    initializeMTGJSONPrices().then(() => {
      if (!mounted) return;
      
      // Après l'initialisation, vérifier si une mise à jour est nécessaire en arrière-plan
      // Cette vérification se fait UNIQUEMENT au démarrage de l'app, pas à chaque accès à Statistics
      if (shouldUpdatePrices()) {
        // Ne pas afficher de log en développement si l'API n'est pas configurée
        const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
        if (!isDev || (import.meta.env.VITE_PRICE_API_URL?.trim() ?? '') !== '') {
          console.log('MTGJSON prices update available (last update > 15 days), triggering server update...');
        }
        updateMTGJSONPrices().then(success => {
          if (!mounted) return;
          if (success) {
            localStorage.setItem('mtgjson_last_update', new Date().toISOString());
            console.log('Server price update completed');
          }
        }).catch(error => {
          if (!mounted) return;
          // Ne pas afficher d'erreur en développement si c'est juste que l'API n'est pas configurée
          const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
          if (!isDev || !error.message?.includes('not configured')) {
            console.warn('Background price update failed:', error);
          }
        });
      }
    }).catch(error => {
      if (!mounted) return;
      console.warn('Failed to initialize MTGJSON prices:', error);
    });
    
    return () => {
      mounted = false;
    };
  }, []);

  return null;
}

// Composant de chargement pour les routes lazy
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Spinner />
  </div>
);

function AppShell() {
  const location = useLocation();
  const isPlayTable = /\/play\/[^/]+\/table\/?$/.test(location.pathname);
  const isPublicChrome =
    location.pathname === '/' ||
    location.pathname === '/login' ||
    location.pathname === '/privacy-policy';
  const hideNav = isPlayTable || isPublicChrome;
  const fillViewport = isPlayTable || location.pathname === '/collection';

  return (
    <>
      <GDPRConsent />
      <div className={isPlayTable ? 'h-full flex flex-col bg-slate-950 overflow-hidden' : 'h-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden'}>
        {!hideNav && <Navbar />}
        <div className={`flex-1 min-h-0 ${fillViewport ? 'overflow-hidden' : 'overflow-y-auto overflow-x-clip'}`}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
              <Route
                path="/collection"
                element={
                  <ProtectedRoute>
                    <Collection />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/decks"
                element={
                  <ProtectedRoute>
                    <Decks />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/community/decks"
                element={
                  <ProtectedRoute>
                    <CommunityDecks />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/decks/:deckId"
                element={
                  <ProtectedRoute>
                    <DeckBuilder />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/wishlist"
                element={
                  <ProtectedRoute>
                    <Wishlist />
                  </ProtectedRoute>
                }
              />
              {/* Accessible sans auth en local pour tester le scan dans l'IDE ; ProtectedRoute en production via build */}
              <Route
                path="/scan"
                element={
                  import.meta.env.PROD ? (
                    <ProtectedRoute>
                      <Scan />
                    </ProtectedRoute>
                  ) : (
                    <Scan />
                  )
                }
              />
              <Route
                path="/scan-compare"
                element={
                  import.meta.env.PROD ? (
                    <ProtectedRoute>
                      <ScanCompare />
                    </ProtectedRoute>
                  ) : (
                    <ScanCompare />
                  )
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/statistics"
                element={
                  <ProtectedRoute>
                    <Statistics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <Admin />
                  </AdminRoute>
                }
              />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route
                path="/play"
                element={
                  <ProtectedRoute>
                    <PlayLobbies />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/play/:lobbyId"
                element={
                  <ProtectedRoute>
                    <PlayLobby />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/play/:lobbyId/table"
                element={
                  <ProtectedRoute>
                    <PlayTable />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </div>
        </div>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ErrorHandlerInitializer />
        <PWAUpdateNotifier />
        <MTGJSONInitializer />
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
