import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useToast } from '../context/ToastContext';
import { errorHandler } from '../services/errorHandler';
import * as playLobbyService from '../services/playLobbyService';
import type { PlayLobby } from '../types/play';
import { isAdmin } from '../types/user';
import { DECK_FORMATS, DECK_FORMAT_LABELS, type DeckFormat } from '../types/deck';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { Modal } from '../components/UI/Modal';
import { ConfirmDialog } from '../components/UI/ConfirmDialog';
import { Spinner } from '../components/UI/Spinner';

export function PlayLobbies() {
  const { currentUser } = useAuth();
  const { profile } = useProfile();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const [lobbies, setLobbies] = useState<PlayLobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<DeckFormat>('commander');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PlayLobby | null>(null);
  const canDeleteLobby = isAdmin(profile);

  const refresh = async () => {
    try {
      if (currentUser) {
        await playLobbyService.closeStaleEmptyLobbies(currentUser.uid);
      }
      const list = await playLobbyService.listLobbies();
      setLobbies(list);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    return playLobbyService.subscribeLobbyList(() => {
      void refresh();
    });
  }, []);

  const handleCreate = async () => {
    if (!currentUser) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showError('Donnez un nom au lobby.');
      return;
    }
    try {
      setCreating(true);
      const lobby = await playLobbyService.createLobby({
        hostId: currentUser.uid,
        name: trimmed,
        format,
        maxPlayers,
      });
      await playLobbyService.joinLobby({
        lobbyId: lobby.id,
        userId: currentUser.uid,
        displayName: profile?.pseudonym || currentUser.email || 'Joueur',
      });
      showSuccess('Lobby créé');
      setShowCreate(false);
      setName('');
      navigate(`/play/${lobby.id}`);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (lobby: PlayLobby) => {
    if (!currentUser) return;
    try {
      setJoiningId(lobby.id);
      await playLobbyService.joinLobby({
        lobbyId: lobby.id,
        userId: currentUser.uid,
        displayName: profile?.pseudonym || currentUser.email || 'Joueur',
      });
      navigate(`/play/${lobby.id}`);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setJoiningId(null);
    }
  };

  const confirmDeleteLobby = async () => {
    if (!toDelete) return;
    const lobby = toDelete;
    try {
      setDeletingId(lobby.id);
      await playLobbyService.deleteLobby(lobby.id);
      showSuccess(`Lobby « ${lobby.name} » supprimé`);
      await refresh();
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="min-w-0">
          <h1 className="page-title">Playtest</h1>
          <p className="page-subtitle max-w-2xl">
            Créez un salon, envoyez le lien, choisissez un deck, puis jouez sur une table digitale
            (piocher, poser, engager, PV). La vidéo est optionnelle. Les règles Magic restent à votre charge.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="shrink-0">Créer un lobby</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : lobbies.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Aucun lobby ouvert. Créez-en un pour lancer un playtest.</p>
      ) : (
        <ul className="space-y-3">
          {lobbies.map((lobby) => (
            <li
              key={lobby.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white">{lobby.name}</p>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      lobby.status === 'playing'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    }`}
                  >
                    {lobby.status === 'playing' ? 'En cours' : 'Ouvert'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {DECK_FORMAT_LABELS[lobby.format]} · jusqu’à {lobby.maxPlayers} joueurs
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {lobby.status === 'waiting' ? (
                  <Button onClick={() => handleJoin(lobby)} loading={joiningId === lobby.id}>
                    Rejoindre
                  </Button>
                ) : (
                  <Link
                    to={`/play/${lobby.id}/table`}
                    className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  >
                    Table
                  </Link>
                )}
                <Link
                  to={`/play/${lobby.id}`}
                  className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                >
                  Détail
                </Link>
                {canDeleteLobby && (
                  <Button
                    variant="danger"
                    onClick={() => setToDelete(lobby)}
                    loading={deletingId === lobby.id}
                  >
                    Supprimer
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nouveau lobby">
        <div className="space-y-4">
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Soirée commander" />
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as DeckFormat)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {DECK_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {DECK_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Joueurs</label>
            <select
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} joueurs
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleCreate} loading={creating} className="w-full">
            Créer
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!toDelete}
        title="Supprimer le lobby"
        message={`Supprimer « ${toDelete?.name || ''} » ? Les sièges et la table associée seront effacés.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
        onConfirm={() => void confirmDeleteLobby()}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
