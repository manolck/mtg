import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';

const features = [
  {
    title: 'Recherche communautaire',
    text: 'Tapez le nom d’une carte et voyez qui la possède dans la communauté, avec le nombre d’exemplaires.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
      </svg>
    ),
  },
  {
    title: 'Collections partagées',
    text: 'Parcourez la collection de chaque joueur, filtrez comme la vôtre, et trouvez ce qu’il vous manque chez les autres.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    title: 'Wishlist & échanges',
    text: 'Listez les cartes recherchées : l’app indique si un membre les a déjà, pour échanger ou acheter plus facilement.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 21s-7-4.4-7-10a5 5 0 019-3 5 5 0 019 3c0 5.6-7 10-7 10z" />
      </svg>
    ),
  },
  {
    title: 'Decks de la communauté',
    text: 'Publiez vos decks, parcourez ceux des autres, copiez une liste et voyez ce qu’il vous reste à trouver.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h11a3 3 0 013 3v11H7a3 3 0 01-3-3V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 6V4a2 2 0 012-2h9a3 3 0 013 3v11h-2" />
      </svg>
    ),
  },
  {
    title: 'Votre collection',
    text: 'Importez, scannez et filtrez vos cartes. Elles deviennent visibles pour les autres joueurs dès que vous les ajoutez.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h10M4 17h7" />
      </svg>
    ),
  },
  {
    title: 'Jouer ensemble',
    text: 'Ouvrez un salon, invitez des amis et jouez avec votre collection — ou un deck publié par la communauté.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 8a3 3 0 11-6 0 3 3 0 016 0zM8 15a3 3 0 11-6 0 3 3 0 016 0zM21 20a4 4 0 00-8 0M11 20a4 4 0 00-8 0" />
      </svg>
    ),
  },
];

const steps = [
  {
    n: '01',
    title: 'Rejoignez la communauté',
    text: 'Créez votre compte et partagez votre collection avec les autres joueurs.',
  },
  {
    n: '02',
    title: 'Cherchez une carte',
    text: 'Parcourez toutes les collections : qui l’a, en combien d’exemplaires, et chez qui.',
  },
  {
    n: '03',
    title: 'Échangez et jouez',
    text: 'Ajoutez-la à votre wishlist, contactez le propriétaire, ou lancez une partie.',
  },
];

const searchHits = [
  { name: 'Solitude', owner: 'Léa', qty: 2, color: 'bg-sky-500' },
  { name: 'Solitude', owner: 'Marc', qty: 1, color: 'bg-orange-500' },
  { name: 'Solitude', owner: 'Anaïs', qty: 3, color: 'bg-violet-500' },
];

const communityOwners = [
  { name: 'Léa', cards: 1240, color: 'bg-sky-500' },
  { name: 'Marc', cards: 860, color: 'bg-orange-500' },
  { name: 'Anaïs', cards: 531, color: 'bg-violet-500' },
  { name: 'Hugo', cards: 318, color: 'bg-emerald-500' },
];

function DarkModeButton() {
  const { isDark, toggleDarkMode } = useDarkMode();
  return (
    <button
      type="button"
      onClick={toggleDarkMode}
      className="p-2.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
}

const primaryCtaClass =
  'inline-flex items-center justify-center min-h-[44px] px-5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors';
const secondaryCtaClass =
  'inline-flex items-center justify-center min-h-[44px] px-5 rounded-lg bg-white/10 dark:bg-white/10 text-gray-900 dark:text-white text-sm font-medium ring-1 ring-gray-200 dark:ring-white/15 hover:bg-gray-50 dark:hover:bg-white/15 transition-colors';

function CommunitySearchPreview() {
  return (
    <div className="surface-card p-4 sm:p-5 shadow-2xl" aria-hidden>
      <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-3">
        Dans la communauté
      </p>
      <div className="flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800/80 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
        </svg>
        Solitude
      </div>
      <ul className="mt-4 space-y-2">
        {searchHits.map((hit) => (
          <li
            key={hit.owner}
            className="flex items-center gap-3 rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2.5 ring-1 ring-gray-200/80 dark:ring-white/10"
          >
            <span className={`w-9 h-9 rounded-full ${hit.color} text-white text-sm font-semibold flex items-center justify-center shrink-0`}>
              {hit.owner.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{hit.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">chez {hit.owner}</p>
            </div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300 shrink-0">
              ×{hit.qty}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        3 joueurs ont cette carte · wishlist ou contact
      </p>
    </div>
  );
}

function CommunityOwnersPreview() {
  return (
    <div className="surface-card p-4 sm:p-5 shadow-xl" aria-hidden>
      <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-3">
        Collections partagées
      </p>
      <ul className="space-y-2">
        {communityOwners.map((owner) => (
          <li
            key={owner.name}
            className="flex items-center gap-3 rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2.5 ring-1 ring-gray-200/80 dark:ring-white/10"
          >
            <span className={`w-9 h-9 rounded-full ${owner.color} text-white text-sm font-semibold flex items-center justify-center shrink-0`}>
              {owner.name.charAt(0)}
            </span>
            <p className="min-w-0 flex-1 font-medium text-sm truncate">{owner.name}</p>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {owner.cards.toLocaleString('fr-FR')} cartes
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Landing() {
  const { currentUser } = useAuth();
  const appHref = currentUser ? '/collection' : '/login';
  const appLabel = currentUser ? 'Ouvrir l’application' : 'Se connecter';
  const joinLabel = currentUser ? 'Ouvrir l’application' : 'Rejoindre la communauté';

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-40 border-b border-gray-200/80 dark:border-white/10 bg-gray-50/90 dark:bg-gray-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <a href="#top" className="font-semibold text-lg tracking-tight">
            MTG Collection
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600 dark:text-gray-300">
            <a href="#communaute" className="hover:text-gray-900 dark:hover:text-white">
              Communauté
            </a>
            <a href="#recherche" className="hover:text-gray-900 dark:hover:text-white">
              Recherche
            </a>
            <a href="#fonctionnalites" className="hover:text-gray-900 dark:hover:text-white">
              Fonctionnalités
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <DarkModeButton />
            <Link to={appHref} className={primaryCtaClass}>
              {appLabel}
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.18),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.28),_transparent_55%)]"
            aria-hidden
          />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">
                La communauté Magic autour de vos collections
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                Trouvez la carte que vous cherchez — chez les autres joueurs.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-xl">
                Partagez votre collection, parcourez celles de la communauté, et voyez d’un coup d’œil qui possède la carte qu’il vous manque.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={appHref} className={primaryCtaClass}>
                  {joinLabel}
                </Link>
                <a href="#communaute" className={secondaryCtaClass}>
                  Découvrir la communauté
                </a>
              </div>
            </div>

            <CommunitySearchPreview />
          </div>
        </section>

        <section id="communaute" className="max-w-6xl mx-auto px-4 sm:px-6 pb-8 sm:pb-12">
          <div className="grid lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-4 sm:space-y-6">
              <article className="surface-card p-6 sm:p-8">
                <h2 className="text-2xl font-bold tracking-tight">Des collections ouvertes aux autres</h2>
                <p className="mt-3 text-gray-600 dark:text-gray-300 leading-relaxed">
                  Chaque joueur peut consulter les collections de la communauté. Changez d’utilisateur, filtrez par couleur, rareté ou édition, et voyez exactement ce que les autres ont en stock.
                </p>
              </article>
              <article className="surface-card p-6 sm:p-8">
                <h2 className="text-2xl font-bold tracking-tight">Des decks à copier et à compléter</h2>
                <p className="mt-3 text-gray-600 dark:text-gray-300 leading-relaxed">
                  Publiez vos listes, parcourez les decks publics, copiez-les et identifiez les cartes manquantes — puis cherchez-les directement chez les membres.
                </p>
              </article>
            </div>
            <CommunityOwnersPreview />
          </div>
        </section>

        <section id="recherche" className="border-y border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Une recherche qui traverse toute la communauté</h2>
              <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                Plus besoin de demander une par une. Cherchez une carte : l’app parcourt toutes les collections, affiche le propriétaire, et vous permet de l’ajouter à votre wishlist pour préparer un échange.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">1.</span>
                  Recherchez dans toutes les collections à la fois.
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">2.</span>
                  Voyez qui a la carte, et en combien d’exemplaires.
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">3.</span>
                  Ajoutez-la à votre wishlist et contactez le joueur.
                </li>
              </ul>
            </div>
            <CommunitySearchPreview />
          </div>
        </section>

        <section id="fonctionnalites" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-2xl mb-10">
            <h2 className="text-3xl font-bold tracking-tight">Tout pour partager, trouver et jouer</h2>
            <p className="mt-3 text-gray-600 dark:text-gray-300">
              La communauté d’abord : collections ouvertes, recherche de cartes, decks publics. Puis vos outils perso — import, scan, et parties en ligne.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="surface-card p-5 sm:p-6 hover:border-blue-200 dark:hover:border-blue-800 transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-lg">{feature.title}</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="comment" className="border-y border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <h2 className="text-3xl font-bold tracking-tight mb-10">En trois étapes</h2>
            <ol className="grid md:grid-cols-3 gap-6">
              {steps.map((step) => (
                <li key={step.n} className="surface-card p-6">
                  <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{step.n}</p>
                  <h3 className="mt-2 font-semibold text-lg">{step.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="jouer" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="surface-card overflow-hidden grid lg:grid-cols-2">
            <div className="p-6 sm:p-10">
              <h2 className="text-3xl font-bold tracking-tight">Jouez avec les mêmes personnes</h2>
              <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                Après avoir trouvé une carte ou copié un deck, lancez un salon. Invitez des adversaires et jouez avec votre collection — ou un deck déjà publié par un autre membre.
              </p>
              <Link to={appHref} className={`${primaryCtaClass} mt-8`}>
                {appLabel}
              </Link>
            </div>
            <div className="min-h-[14rem] bg-gradient-to-br from-slate-900 via-blue-950 to-emerald-950 p-8 flex items-end">
              <p className="text-white/90 text-sm">Salons · decks communautaires · collections partagées</p>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          <div className="rounded-2xl bg-blue-600 text-white px-6 py-10 sm:px-12 sm:py-14 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Prêt à rejoindre les autres joueurs ?</h2>
              <p className="mt-2 text-blue-100 max-w-xl">
                Connectez-vous pour partager votre collection, chercher des cartes dans la communauté et échanger.
              </p>
            </div>
            <Link
              to={appHref}
              className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-lg bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors shrink-0"
            >
              {joinLabel}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm text-gray-500 dark:text-gray-400">
          <p>MTG Collection · collections partagées</p>
          <div className="flex gap-4">
            <Link to={appHref} className="hover:text-gray-900 dark:hover:text-white">
              {appLabel}
            </Link>
            <Link to="/privacy-policy" className="hover:text-gray-900 dark:hover:text-white">
              Confidentialité
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
