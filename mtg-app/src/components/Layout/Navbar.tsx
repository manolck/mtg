import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useAdmin } from '../../hooks/useAdmin';
import { useDarkMode } from '../../hooks/useDarkMode';
import { Button } from '../UI/Button';
import { AvatarDisplay } from '../UI/AvatarDisplay';

const navLinkClass =
  'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium block';

export function Navbar() {
  const { currentUser, logout } = useAuth();
  const { profile } = useProfile();
  const { isAdmin } = useAdmin();
  const { isDark, toggleDarkMode } = useDarkMode();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  if (!currentUser) {
    return null;
  }

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-md relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo + liens desktop */}
          <div className="flex items-center space-x-4">
            <Link
              to="/collection"
              className="text-gray-900 dark:text-white font-semibold text-xl shrink-0"
            >
              MTG Collection
            </Link>
            {/* Liens visibles uniquement à partir de md */}
            <div className="hidden md:flex items-center space-x-1">
              <Link to="/collection" className={navLinkClass}>
                Collection
              </Link>
              <Link to="/decks" className={navLinkClass}>
                Decks
              </Link>
              <Link to="/wishlist" className={navLinkClass}>
                Wishlist
              </Link>
              <Link to="/statistics" className={navLinkClass}>
                Statistiques
              </Link>
              <Link to="/profile" className={navLinkClass}>
                Profil
              </Link>
              {isAdmin && (
                <Link to="/admin" className={navLinkClass}>
                  Admin
                </Link>
              )}
            </div>
          </div>

          {/* Droite : desktop (caché sur mobile) */}
          <div className="hidden md:flex items-center space-x-4">
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
            <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <AvatarDisplay avatarId={profile?.avatarId} size="sm" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {profile?.pseudonym || currentUser.email}
              </span>
            </Link>
            <Link
              to="/privacy-policy"
              className={navLinkClass}
              title="Politique de confidentialité"
            >
              Confidentialité
            </Link>
            <Button variant="secondary" onClick={handleLogout}>
              Déconnexion
            </Button>
          </div>

          {/* Mobile : bouton menu + actions compactes */}
          <div className="flex md:hidden items-center gap-2">
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
            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Menu mobile (drawer) */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          <div className="absolute left-0 right-0 top-16 z-50 md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg rounded-b-lg overflow-hidden">
            <div className="px-4 py-3 space-y-1">
              <Link
                to="/collection"
                className={navLinkClass}
                onClick={closeMobileMenu}
              >
                Collection
              </Link>
              <Link to="/decks" className={navLinkClass} onClick={closeMobileMenu}>
                Decks
              </Link>
              <Link to="/wishlist" className={navLinkClass} onClick={closeMobileMenu}>
                Wishlist
              </Link>
              <Link to="/statistics" className={navLinkClass} onClick={closeMobileMenu}>
                Statistiques
              </Link>
              <Link to="/profile" className={navLinkClass} onClick={closeMobileMenu}>
                Profil
              </Link>
              {isAdmin && (
                <Link to="/admin" className={navLinkClass} onClick={closeMobileMenu}>
                  Admin
                </Link>
              )}
              <Link
                to="/privacy-policy"
                className={navLinkClass}
                onClick={closeMobileMenu}
                title="Politique de confidentialité"
              >
                Confidentialité
              </Link>
              <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
                <Link to="/profile" className="flex items-center gap-2 flex-1 min-w-0" onClick={closeMobileMenu}>
                  <AvatarDisplay avatarId={profile?.avatarId} size="sm" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {profile?.pseudonym || currentUser.email}
                  </span>
                </Link>
                <Button variant="secondary" onClick={handleLogout} className="shrink-0">
                  Déconnexion
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

