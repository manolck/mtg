import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { AdminRoute } from './components/Layout/AdminRoute';
import { Navbar } from './components/Layout/Navbar';
import { Spinner } from './components/UI/Spinner';
import { Login } from './pages/Login';

// Lazy load des routes principales pour réduire le bundle initial
const Collection = lazy(() => import('./pages/Collection').then(module => ({ default: module.Collection })));
const Decks = lazy(() => import('./pages/Decks').then(module => ({ default: module.Decks })));
const DeckBuilder = lazy(() => import('./pages/DeckBuilder').then(module => ({ default: module.DeckBuilder })));
const Profile = lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const Admin = lazy(() => import('./pages/Admin').then(module => ({ default: module.Admin })));
const Statistics = lazy(() => import('./pages/Statistics').then(module => ({ default: module.Statistics })));
const Wishlist = lazy(() => import('./pages/Wishlist').then(module => ({ default: module.Wishlist })));
import { setErrorToastCallback } from './services/errorHandler';
import { useToast } from './context/ToastContext';
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
        if (!isDev || !import.meta.env.VITE_FIREBASE_FUNCTIONS_URL?.includes('YOUR-PROJECT-ID')) {
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

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ErrorHandlerInitializer />
        <MTGJSONInitializer />
        <BrowserRouter>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Navbar />
          <Routes>
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
            <Route path="/" element={<Navigate to="/collection" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
