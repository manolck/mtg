import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useAdmin } from '../../hooks/useAdmin';
import { useDarkMode } from '../../hooks/useDarkMode';
import { Button } from '../UI/Button';
import { AvatarDisplay } from '../UI/AvatarDisplay';

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-2.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
    isActive
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
  }`;

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-3 rounded-lg text-base font-medium block ${
    isActive
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
  }`;

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
      setMobileMenuOpen(false);
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileMenuOpen]);

  if (!currentUser) {
    return null;
  }

  const links = [
    { to: '/collection', label: 'Collection' },
    { to: '/decks', label: 'Decks' },
    { to: '/community/decks', label: 'Communauté' },
    { to: '/play', label: 'Jouer' },
    { to: '/wishlist', label: 'Wishlist' },
    { to: '/scan', label: 'Scanner' },
    { to: '/statistics', label: 'Statistiques' },
  ];

  const DarkModeButton = ({ className = '' }: { className?: string }) => (
    <button
      type="button"
      onClick={toggleDarkMode}
      className={`p-2.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className}`}
      title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
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
  );

  return (
    <nav className="sticky top-0 z-40 shrink-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16 gap-2">
          <div className="flex items-center min-w-0 gap-2 lg:gap-3">
            <Link
              to="/collection"
              className="text-gray-900 dark:text-white font-semibold text-lg sm:text-xl shrink-0"
            >
              <span className="sm:hidden">MTG</span>
              <span className="hidden sm:inline">MTG Collection</span>
            </Link>
            <div className="hidden lg:flex items-center gap-0.5 min-w-0">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} className={desktopLinkClass}>
                  {link.label}
                </NavLink>
              ))}
              {isAdmin && (
                <NavLink to="/admin" className={desktopLinkClass}>
                  Admin
                </NavLink>
              )}
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <DarkModeButton />
            <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 max-w-[12rem]">
              <AvatarDisplay avatarId={profile?.avatarId} size="sm" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                {profile?.pseudonym || currentUser.email}
              </span>
            </Link>
            <Button variant="secondary" onClick={handleLogout} size="sm">
              Déconnexion
            </Button>
          </div>

          <div className="flex lg:hidden items-center gap-1">
            <DarkModeButton />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="p-2.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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

      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 top-14 sm:top-16 bg-black/50 z-40 lg:hidden"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          <div className="fixed top-14 sm:top-16 right-0 bottom-0 z-50 lg:hidden w-[min(20rem,100vw)] bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-xl overflow-y-auto">
            <div className="px-3 py-4 space-y-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={mobileLinkClass}
                  onClick={closeMobileMenu}
                >
                  {link.label}
                </NavLink>
              ))}
              <NavLink to="/profile" className={mobileLinkClass} onClick={closeMobileMenu}>
                Profil
              </NavLink>
              {isAdmin && (
                <NavLink to="/admin" className={mobileLinkClass} onClick={closeMobileMenu}>
                  Admin
                </NavLink>
              )}
              <NavLink to="/privacy-policy" className={mobileLinkClass} onClick={closeMobileMenu}>
                Confidentialité
              </NavLink>
              <div className="pt-4 mt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <Link
                  to="/profile"
                  className="flex items-center gap-3 px-3 min-w-0"
                  onClick={closeMobileMenu}
                >
                  <AvatarDisplay avatarId={profile?.avatarId} size="sm" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {profile?.pseudonym || currentUser.email}
                  </span>
                </Link>
                <div className="px-3">
                  <Button variant="secondary" onClick={handleLogout} className="w-full">
                    Déconnexion
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
