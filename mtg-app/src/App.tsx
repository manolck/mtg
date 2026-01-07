import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { AdminRoute } from './components/Layout/AdminRoute';
import { Navbar } from './components/Layout/Navbar';
import { Login } from './pages/Login';
import { Collection } from './pages/Collection';
import { Decks } from './pages/Decks';
import { DeckBuilder } from './pages/DeckBuilder';
import { Profile } from './pages/Profile';
import { Admin } from './pages/Admin';
import { Statistics } from './pages/Statistics';

function App() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}

export default App;
