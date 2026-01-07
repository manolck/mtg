import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useAdmin } from '../../hooks/useAdmin';
import { useDarkMode } from '../../hooks/useDarkMode';
import { Button } from '../UI/Button';
import { AvatarDisplay } from '../UI/AvatarDisplay';

export function Navbar() {
  const { currentUser, logout } = useAuth();
  const { profile } = useProfile();
  const { isAdmin } = useAdmin();
  const { isDark, toggleDarkMode } = useDarkMode();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-4">
            <Link
              to="/collection"
              className="text-gray-900 dark:text-white font-semibold text-xl"
            >
              MTG Collection
            </Link>
            <Link
              to="/collection"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
            >
              Collection
            </Link>
            <Link
              to="/decks"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
            >
              Decks
            </Link>
            <Link
              to="/statistics"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
            >
              Statistiques
            </Link>
            <Link
              to="/profile"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
            >
              Profil
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                Admin
              </Link>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {/* Toggle Dark Mode */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            >
              {isDark ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <Link
              to="/profile"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <AvatarDisplay 
                avatarId={profile?.avatarId} 
                size="sm"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {profile?.pseudonym || currentUser.email}
              </span>
            </Link>
            <Button variant="secondary" onClick={handleLogout}>
              Déconnexion
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}

