import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';

const collectionTools = [
  {
    title: 'Inventaire filtré',
    text: 'Retrouvez n’importe quelle carte par nom, couleur, rareté, type ou édition — sans faire défiler toute la collection.',
  },
  {
    title: 'Scanner photo',
    text: 'Photographiez une carte : l’app lit le nom et l’édition, puis l’ajoute à votre inventaire sans saisie.',
  },
  {
    title: 'Import et export',
    text: 'Chargez un CSV ou un JSON, ou exportez votre collection pour la sauvegarder et la déplacer.',
  },
  {
    title: 'Plusieurs collections',
    text: 'Séparez vos binders, vos decks en papier ou vos stocks à échanger, et basculez d’un inventaire à l’autre.',
  },
  {
    title: 'Statistiques',
    text: 'Valeur, couleurs, raretés, éditions : voyez d’un coup d’œil comment votre collection est répartie.',
  },
  {
    title: 'Wishlist perso',
    text: 'Marquez les cartes que vous cherchez encore. Elles restent liées à votre collection pour les échanges.',
  },
];

const communityTools = [
  {
    title: 'Collections ouvertes',
    text: 'Parcourez la collection de chaque joueur, filtrez comme la vôtre, et voyez ce que les autres ont en stock.',
  },
  {
    title: 'Recherche communautaire',
    text: 'Tapez un nom de carte : l’app parcourt toutes les collections et affiche qui la possède, et en combien d’exemplaires.',
  },
  {
    title: 'Wishlist et échanges',
    text: 'Ajoutez une carte à votre wishlist depuis un résultat communautaire, puis contactez le propriétaire.',
  },
];

const deckTools = [
  {
    title: 'Depuis votre collection',
    text: 'Cherchez uniquement les cartes que vous possédez, ou ouvrez le catalogue complet. Main, side, maybeboard et commanders.',
  },
  {
    title: 'Formats et légalité',
    text: 'Modern, Commander, Pioneer… La validation signale les cartes illégales avant de publier.',
  },
  {
    title: 'Possession en direct',
    text: 'Voyez le pourcentage de la liste déjà en collection, et la liste des exemplaires manquants.',
  },
  {
    title: 'Wishlist et achats',
    text: 'Ajoutez les manquants à votre wishlist, générez une liste d’achats, et cherchez-les dans la communauté.',
  },
  {
    title: 'Tester le deck',
    text: 'Sample hand, courbe de mana, répartition des types, terrains de base automatiques et changement d’édition.',
  },
  {
    title: 'Partager et copier',
    text: 'Importez ou exportez une decklist, publiez-la, partagez un lien unlisted, ou forkez un deck communautaire.',
  },
];

const playTools = [
  {
    title: 'Créer ou rejoindre un salon',
    text: 'Nommez un lobby, choisissez le format et 2 à 4 joueurs. Envoyez le lien, ou rejoignez un salon déjà ouvert.',
  },
  {
    title: 'Deck et prêt',
    text: 'Chacun prend son deck — le sien ou un deck communautaire. Quand tout le monde est prêt, l’hôte lance la table.',
  },
  {
    title: 'Table digitale',
    text: 'Piochez, posez, engagez, retournez, et déplacez les cartes entre main, champ, cimetière, exil et commandement.',
  },
  {
    title: 'PV, poison et tour',
    text: 'Suivez les points de vie et le poison, mulligan, passez le tour. Les règles Magic restent à votre charge.',
  },
  {
    title: 'Recherche en bibliothèque',
    text: 'Cherchez une carte dans votre bibliothèque, mettez-la en jeu ou sur le dessus, puis mélangez si besoin.',
  },
  {
    title: 'Micro optionnel',
    text: 'Autorisez le micro si vous voulez parler aux autres joueurs. Vous pouvez refuser : la partie continue sans audio.',
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

const manaCurvePreview = [2, 7, 11, 9, 5, 3, 2];
const missingPreview = [
  { qty: 2, name: 'Lightning Helix' },
  { qty: 1, name: 'Wear // Tear' },
  { qty: 3, name: 'Sacred Foundry' },
];

const lobbyPreview = [
  { name: 'Soirée Commander', format: 'Commander', seats: '2 / 4', status: 'Ouvert', live: false },
  { name: 'Modern du jeudi', format: 'Modern', seats: '2 / 2', status: 'En cours', live: true },
];

const manaColors = [
  { label: 'W', className: 'bg-amber-100 text-amber-900 dark:bg-amber-200/90 dark:text-amber-950' },
  { label: 'U', className: 'bg-sky-500 text-white' },
  { label: 'B', className: 'bg-gray-800 text-white' },
  { label: 'R', className: 'bg-red-600 text-white' },
  { label: 'G', className: 'bg-emerald-600 text-white' },
  { label: 'C', className: 'bg-gray-300 text-gray-800 dark:bg-gray-500 dark:text-white' },
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

function CollectionPreview() {
  return (
    <div className="surface-card p-4 sm:p-5 shadow-2xl" aria-hidden>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">Votre collection</p>
          <p className="font-semibold mt-1">953 cartes · 2 binders</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 shrink-0">
          Scan prêt
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800/80 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
        </svg>
        Lightning Bolt
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {manaColors.map((pip) => (
          <span
            key={pip.label}
            className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center ${pip.className}`}
          >
            {pip.label}
          </span>
        ))}
        {['Commune', 'Unco', 'Rare'].map((label) => (
          <span
            key={label}
            className="text-[11px] px-2 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3 items-end">
        <div className="relative h-36">
          <div className="absolute left-2 top-4 w-[4.6rem] aspect-[63/88] rounded-lg bg-gradient-to-br from-sky-400 to-blue-800 -rotate-12 shadow-xl ring-1 ring-white/20" />
          <div className="absolute left-10 top-1 w-[4.6rem] aspect-[63/88] rounded-lg bg-gradient-to-br from-amber-400 to-red-800 rotate-6 shadow-xl ring-1 ring-white/20" />
          <div className="absolute left-20 top-6 w-[4.8rem] aspect-[63/88] rounded-lg bg-gradient-to-br from-gray-700 to-gray-950 shadow-xl ring-1 ring-white/10 flex items-end p-2">
            <p className="text-[10px] text-white/90 leading-tight">Lightning Bolt</p>
          </div>
        </div>
        <div className="w-[6.5rem] rounded-xl bg-gray-900 text-white p-3 ring-1 ring-white/10">
          <div className="aspect-[3/4] rounded-md bg-gradient-to-br from-gray-700 to-gray-950 ring-1 ring-white/15 flex items-center justify-center">
            <svg className="w-7 h-7 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
              <circle cx="12" cy="12" r="3.2" strokeWidth={1.8} />
            </svg>
          </div>
          <p className="text-[10px] text-center mt-2 text-white/80">Photo → ajout</p>
        </div>
      </div>
    </div>
  );
}

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

function DeckBuilderPreview() {
  const maxCurve = Math.max(...manaCurvePreview);
  return (
    <div className="surface-card p-4 sm:p-5 shadow-2xl" aria-hidden>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold">Boros Aggro</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Modern · Main 58 · Side 15</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 shrink-0">
          78 % possédé
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
        <div className="h-full w-[78%] rounded-full bg-emerald-500" />
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">47 / 60 cartes déjà en collection</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
        Courbe de mana
      </p>
      <div className="mt-2 flex items-end gap-1.5 h-20">
        {manaCurvePreview.map((value, index) => (
          <div key={index} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
            <div
              className="w-full rounded-t bg-blue-500/80 dark:bg-blue-400/80 min-h-[4px]"
              style={{ height: `${Math.max(8, (value / maxCurve) * 100)}%` }}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{index === 6 ? '6+' : index}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
        Manquantes
      </p>
      <ul className="mt-2 space-y-1.5">
        {missingPreview.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between text-sm rounded-lg bg-white/70 dark:bg-white/5 px-3 py-2 ring-1 ring-gray-200/80 dark:ring-white/10"
          >
            <span className="truncate">{row.name}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">×{row.qty}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {['Sample hand', 'Liste d’achats', 'Publier'].map((label) => (
          <span
            key={label}
            className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayLobbyPreview() {
  return (
    <div className="surface-card p-4 sm:p-5 shadow-2xl" aria-hidden>
      <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-3">
        Lobbies
      </p>
      <ul className="space-y-2">
        {lobbyPreview.map((lobby) => (
          <li
            key={lobby.name}
            className="flex items-center justify-between gap-3 rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2.5 ring-1 ring-gray-200/80 dark:ring-white/10"
          >
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{lobby.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {lobby.format} · {lobby.seats} joueurs
              </p>
            </div>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                lobby.live
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              }`}
            >
              {lobby.status}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-950 p-4 text-white">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p>
            <span className="font-semibold">Léa</span>
            <span className="text-white/70"> · 40 PV</span>
          </p>
          <p className="text-[11px] uppercase tracking-wide text-emerald-300">Tour de Léa</p>
          <p>
            <span className="font-semibold">Marc</span>
            <span className="text-white/70"> · 36 PV</span>
          </p>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-12 h-[4.25rem] rounded-md bg-gradient-to-br from-sky-400/80 to-blue-800 shadow-lg ring-1 ring-white/20"
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Piocher', 'Engager', 'Bibliothèque'].map((label) => (
            <span key={label} className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 text-white/90">
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const { currentUser } = useAuth();
  const appHref = currentUser ? '/collection' : '/login';
  const scanHref = currentUser ? '/scan' : '/login';
  const deckHref = currentUser ? '/decks' : '/login';
  const playHref = currentUser ? '/play' : '/login';
  const appLabel = currentUser ? 'Ouvrir l’application' : 'Se connecter';
  const joinLabel = currentUser ? 'Ouvrir l’application' : 'Se connecter';

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-40 border-b border-gray-200/80 dark:border-white/10 bg-gray-50/90 dark:bg-gray-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <a href="#collection" className="font-semibold text-lg tracking-tight">
            MTG Collection
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600 dark:text-gray-300">
            <a href="#collection" className="hover:text-gray-900 dark:hover:text-white">
              Collection
            </a>
            <a href="#communaute" className="hover:text-gray-900 dark:hover:text-white">
              Communauté
            </a>
            <a href="#decks" className="hover:text-gray-900 dark:hover:text-white">
              Decks
            </a>
            <a href="#jouer" className="hover:text-gray-900 dark:hover:text-white">
              Jouer
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

      <main>
        <section id="collection" className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.18),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.28),_transparent_55%)]"
            aria-hidden
          />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">
                  Collection et scan
                </p>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                  Rangez vos cartes, scannez-les, retrouvez-les.
                </h1>
                <p className="mt-5 text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-xl">
                  Importez un CSV, photographiez un booster, filtrez par couleur ou édition. Votre inventaire devient la base de tout le reste : communauté, decks et parties.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to={appHref} className={primaryCtaClass}>
                    {currentUser ? 'Ouvrir ma collection' : joinLabel}
                  </Link>
                  <Link to={scanHref} className={secondaryCtaClass}>
                    {currentUser ? 'Scanner une carte' : 'Découvrir le scan'}
                  </Link>
                </div>
              </div>
              <CollectionPreview />
            </div>
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {collectionTools.map((tool) => (
                <article key={tool.title} className="surface-card p-5 sm:p-6">
                  <h3 className="font-semibold text-lg">{tool.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{tool.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="communaute" className="border-y border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">
                  Communauté et recherche
                </p>
                <h2 className="text-3xl font-bold tracking-tight">Trouvez la carte chez les autres joueurs.</h2>
                <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                  Une fois votre collection en ligne, elle est visible par la communauté. Cherchez un nom : l’app parcourt tous les inventaires, affiche le propriétaire, et vous laisse l’ajouter à votre wishlist pour préparer un échange.
                </p>
                <Link to={appHref} className={`${primaryCtaClass} mt-8`}>
                  {currentUser ? 'Parcourir les collections' : joinLabel}
                </Link>
              </div>
              <div className="space-y-4">
                <CommunitySearchPreview />
                <CommunityOwnersPreview />
              </div>
            </div>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {communityTools.map((tool) => (
                <article key={tool.title} className="surface-card p-5 sm:p-6">
                  <h3 className="font-semibold text-lg">{tool.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{tool.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="decks" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">Construction de decks</p>
              <h2 className="text-3xl font-bold tracking-tight">Buildez avec ce que vous avez — et trouvez le reste.</h2>
              <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                Le builder relie votre collection, la communauté et le format. Ajoutez des cartes depuis ce que vous possédez, importez une liste, validez la légalité, puis voyez d’un coup d’œil ce qu’il reste à échanger, acheter ou chercher chez les autres.
              </p>
              <Link to={deckHref} className={`${primaryCtaClass} mt-8`}>
                {currentUser ? 'Ouvrir mes decks' : joinLabel}
              </Link>
            </div>
            <DeckBuilderPreview />
          </div>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {deckTools.map((tool) => (
              <article key={tool.title} className="surface-card p-5 sm:p-6">
                <h3 className="font-semibold text-lg">{tool.title}</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{tool.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="jouer" className="border-y border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">Lobbies et parties</p>
                <h2 className="text-3xl font-bold tracking-tight">Créez un salon, asseyez-vous, jouez.</h2>
                <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                  Un playtest en ligne avec vos vrais decks. Ouvrez un lobby, invitez des adversaires, choisissez une liste — la vôtre ou une liste communautaire — puis lancez la table : piocher, poser, engager, PV. Le micro est facultatif. Les règles restent entre vous.
                </p>
                <Link to={playHref} className={`${primaryCtaClass} mt-8`}>
                  {currentUser ? 'Ouvrir les lobbies' : joinLabel}
                </Link>
              </div>
              <PlayLobbyPreview />
            </div>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {playTools.map((tool) => (
                <article key={tool.title} className="surface-card p-5 sm:p-6">
                  <h3 className="font-semibold text-lg">{tool.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{tool.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="rounded-2xl bg-blue-600 text-white px-6 py-10 sm:px-12 sm:py-14 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Prêt à ranger vos cartes ?</h2>
              <p className="mt-2 text-blue-100 max-w-xl">
                Connectez-vous pour scanner votre collection, la partager, construire des decks et lancer une partie.
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
          <p>MTG Collection</p>
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
