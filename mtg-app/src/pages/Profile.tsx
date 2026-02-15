import { useState, useEffect, useRef } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useImports } from '../hooks/useImports';
import { useCollection } from '../hooks/useCollection';
import { useUserCollections } from '../hooks/useUserCollections';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { errorHandler } from '../services/errorHandler';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { AvatarDisplay } from '../components/UI/AvatarDisplay';
import { Spinner } from '../components/UI/Spinner';
import { ImportJobCard } from '../components/Import/ImportJobCard';
import { ImportReportModal } from '../components/Import/ImportReportModal';
import { Modal } from '../components/UI/Modal';
import { ProgressBar } from '../components/UI/ProgressBar';
import { ConfirmDialog } from '../components/UI/ConfirmDialog';
import { AVATARS } from '../data/avatars';
import { pb } from '../services/pocketbase';
import type { ImportJob } from '../types/import';

export function Profile() {
  const { profile, loading, error, updateProfile } = useProfile();
  const { imports, loading: loadingImports, updateImportStatus, deleteImport } = useImports();
  const {
    cards,
    importCSV,
    deleteAllCards,
    cancelImport,
    importProgress,
    pauseImport,
    resumeImport,
    isImportPaused,
    refresh: refreshCollection,
  } = useCollection();
  const {
    collections: userCollections,
    loading: loadingUserCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    refresh: refreshUserCollections,
  } = useUserCollections();
  const { showSuccess, showError } = useToast();
  const { currentUser } = useAuth();
  const [_showCancelImportConfirm, _setShowCancelImportConfirm] = useState(false);
  const [showDeleteImportConfirm, setShowDeleteImportConfirm] = useState<string | null>(null);
  const [pseudonym, setPseudonym] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'fr'>('en');
  const [saving, setSaving] = useState(false);
  const [selectedImport, setSelectedImport] = useState<ImportJob | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeImportId, setResumeImportId] = useState<string | null>(null);
  const [resumeImporting, setResumeImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const [importing, setImporting] = useState(false);
  const [importTargetCollectionId, setImportTargetCollectionId] = useState<string | null>(null);
  const [showDeleteCollectionConfirm, setShowDeleteCollectionConfirm] = useState(false);
  const [collectionToDeleteId, setCollectionToDeleteId] = useState<string | null>(null);
  const newImportFileInputRef = useRef<HTMLInputElement>(null);
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [showRenameCollectionModal, setShowRenameCollectionModal] = useState(false);
  const [renameCollectionId, setRenameCollectionId] = useState<string | null>(null);
  const [renameCollectionName, setRenameCollectionName] = useState('');
  const [renamingCollection, setRenamingCollection] = useState(false);
  
  // État pour le changement de mot de passe
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Initialiser le pseudonyme et la langue quand le profil est chargé
  useEffect(() => {
    if (profile) {
      setPseudonym(profile.pseudonym || '');
      setPreferredLanguage(profile.preferredLanguage || 'en');
    }
  }, [profile]);

  const handleSavePseudonym = async () => {
    if (!pseudonym.trim()) {
      showError('Le pseudonyme ne peut pas être vide');
      return;
    }

    try {
      setSaving(true);
      await updateProfile({ pseudonym: pseudonym.trim() });
      showSuccess('Pseudonyme mis à jour avec succès !');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = async (language: 'en' | 'fr') => {
    if (language === preferredLanguage) {
      return; // Déjà sélectionné
    }

    try {
      setPreferredLanguage(language);
      await updateProfile({ preferredLanguage: language });
      showSuccess('Langue préférée mise à jour');
    } catch (err) {
      // Revenir à l'ancienne valeur en cas d'erreur
      setPreferredLanguage(profile?.preferredLanguage || 'en');
      errorHandler.handleAndShowError(err);
    }
  };

  const handleAvatarSelect = async (avatarId: string) => {
    if (profile?.avatarId === avatarId) {
      return; // Déjà sélectionné
    }

    try {
      await updateProfile({ avatarId });
      showSuccess('Avatar mis à jour');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleNewImportFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let targetId: string | null = importTargetCollectionId;
    if (userCollections.length > 0 && !targetId) {
      showError('Veuillez sélectionner une collection de destination.');
      return;
    }
    if (userCollections.length === 0) {
      try {
        const created = await createCollection('Ma collection');
        targetId = created?.id ?? null;
        await refreshUserCollections();
      } catch (err) {
        errorHandler.handleAndShowError(err);
        return;
      }
    }
    try {
      setImporting(true);
      const text = await file.text();
      await importCSV(text, importMode === 'update', undefined, targetId ?? undefined);
      showSuccess('Import terminé avec succès');
      if (newImportFileInputRef.current) {
        newImportFileInputRef.current.value = '';
      }
      refreshCollection();
      refreshUserCollections();
    } catch (err) {
      errorHandler.handleAndShowError(err);
      setShowImportModal(false);
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (importProgress && importProgress.current >= importProgress.total && importProgress.total > 0) {
      const timer = setTimeout(() => {
        setShowImportModal(false);
        if (newImportFileInputRef.current) {
          newImportFileInputRef.current.value = '';
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [importProgress]);

  const handleDeleteCollectionConfirm = async () => {
    if (!collectionToDeleteId) return;
    try {
      await deleteCollection(collectionToDeleteId);
      showSuccess('Collection supprimée');
      setShowDeleteCollectionConfirm(false);
      setCollectionToDeleteId(null);
      refreshCollection();
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      showError('Nom de la collection requis');
      return;
    }
    try {
      setCreatingCollection(true);
      await createCollection(newCollectionName.trim());
      showSuccess('Collection créée');
      setShowCreateCollectionModal(false);
      setNewCollectionName('');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setCreatingCollection(false);
    }
  };

  const handleRenameCollection = async () => {
    if (!renameCollectionId || !renameCollectionName.trim()) return;
    try {
      setRenamingCollection(true);
      await updateCollection(renameCollectionId, renameCollectionName.trim());
      showSuccess('Collection renommée');
      setShowRenameCollectionModal(false);
      setRenameCollectionId(null);
      setRenameCollectionName('');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setRenamingCollection(false);
    }
  };

  const handleResumeImport = async (importId: string) => {
    try {
      setResumeImporting(true);
      
      // Trouver l'import dans la liste
      const importJob = imports.find(imp => imp.id === importId);
      
      if (!importJob) {
        showError('Import introuvable');
        return;
      }

      if (!importJob.csvContent) {
        // Si le CSV n'est pas stocké (fichier trop volumineux), demander de re-uploader
        setResumeImportId(importId);
        setShowResumeModal(true);
        setResumeImporting(false);
        return;
      }

      // Reprendre l'import directement avec le CSV stocké
      await importCSV(importJob.csvContent, importJob.mode === 'update', importId);
      showSuccess('Import repris avec succès');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setResumeImporting(false);
    }
  };

  const handleResumeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !resumeImportId) return;

    try {
      setResumeImporting(true);
      const text = await file.text();
      
      // Fermer la modal
      setShowResumeModal(false);
      
      // Trouver l'import pour récupérer le mode
      const importJob = imports.find(imp => imp.id === resumeImportId);
      const updateMode = importJob?.mode === 'update';
      
      // Reprendre l'import avec l'importId existant
      await importCSV(text, updateMode, resumeImportId);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setResumeImportId(null);
      showSuccess('Import repris avec succès');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setResumeImporting(false);
    }
  };

  const handleCancelImport = async (importId: string) => {
    _setShowCancelImportConfirm(true);
    setResumeImportId(importId);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _confirmCancelImport = async () => {
    if (!resumeImportId) return;
    try {
      await updateImportStatus(resumeImportId, 'cancelled');
      cancelImport();
      showSuccess('Import annulé');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleViewReport = (importJob: ImportJob) => {
    setSelectedImport(importJob);
    setShowReportModal(true);
  };

  const handleDeleteImport = async (importId: string) => {
    setShowDeleteImportConfirm(importId);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _confirmDeleteImport = async () => {
    if (!showDeleteImportConfirm) return;
    try {
      await deleteImport(showDeleteImportConfirm);
      showSuccess('Import supprimé');
      setShowDeleteImportConfirm(null);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword.trim()) {
      showError('Veuillez entrer votre mot de passe actuel');
      return;
    }

    if (!newPassword.trim()) {
      showError('Veuillez entrer un nouveau mot de passe');
      return;
    }

    if (newPassword.length < 6) {
      showError('Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      showError('Les nouveaux mots de passe ne correspondent pas');
      return;
    }

    if (currentPassword === newPassword) {
      showError('Le nouveau mot de passe doit être différent de l\'actuel');
      return;
    }

    if (!currentUser) {
      showError('Vous devez être connecté pour changer votre mot de passe');
      return;
    }

    try {
      setChangingPassword(true);

      // PocketBase nécessite une réauthentification avant de changer le mot de passe
      // On se reconnecte avec l'email et le mot de passe actuel pour vérifier
      let authenticatedUserId: string;
      try {
        const authResult = await pb.collection('users').authWithPassword(currentUser.email!, currentPassword);
        // Utiliser l'ID de l'utilisateur authentifié (peut être différent si authWithPassword change l'utilisateur)
        authenticatedUserId = authResult.record.id;
      } catch (authErr: any) {
        if (authErr.status === 400 || authErr.status === 404) {
          showError('Mot de passe actuel incorrect');
          return;
        }
        throw authErr;
      }

      // Mettre à jour le mot de passe via l'API PocketBase
      // PocketBase nécessite :
      // - oldPassword : le mot de passe actuel
      // - password : le nouveau mot de passe
      // - passwordConfirm : confirmation du nouveau mot de passe
      // Utiliser l'ID de l'utilisateur authentifié
      await pb.collection('users').update(authenticatedUserId, {
        oldPassword: currentPassword,
        password: newPassword,
        passwordConfirm: newPassword,
      });

      // Réinitialiser le formulaire
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      showSuccess('Mot de passe modifié avec succès !');
    } catch (err: any) {
      console.error('Error changing password:', err);
      console.error('Error details:', {
        status: err.status,
        message: err.message,
        response: err.response,
        data: err.data,
      });
      
      // Gestion des erreurs spécifiques
      if (err.status === 400) {
        const errorMessage = err.message || err.data?.message || '';
        if (errorMessage.includes('password') || errorMessage.includes('incorrect') || errorMessage.includes('invalid')) {
          showError('Mot de passe actuel incorrect ou nouveau mot de passe invalide');
        } else if (errorMessage.includes('weak') || errorMessage.includes('minimum')) {
          showError('Le nouveau mot de passe est trop faible (minimum 6 caractères)');
        } else if (errorMessage.includes('match') || errorMessage.includes('confirm')) {
          showError('Les mots de passe ne correspondent pas');
        } else {
          showError(`Erreur lors du changement de mot de passe: ${errorMessage || 'Erreur inconnue'}`);
        }
      } else if (err.status === 403 || err.status === 401) {
        showError('Vous n\'avez pas la permission de modifier votre mot de passe');
      } else {
        errorHandler.handleAndShowError(err);
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const activeImports = imports.filter(imp => 
    imp.status === 'running' || imp.status === 'paused' || imp.status === 'pending'
  );
  const completedImports = imports.filter(imp => 
    imp.status === 'completed' || imp.status === 'failed' || imp.status === 'cancelled'
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-600 dark:text-gray-400">
          Erreur lors du chargement du profil
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        Mon Profil
      </h1>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
        {/* Avatar Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Avatar
          </h2>
          <div className="flex items-center gap-6 mb-6">
            <div className="flex-shrink-0">
              <AvatarDisplay 
                avatarId={profile.avatarId} 
                size="lg"
              />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sélectionnez un avatar parmi ceux disponibles ci-dessous.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-4">
            {AVATARS.map((avatar) => (
              <button
                key={avatar.id}
                onClick={() => handleAvatarSelect(avatar.id)}
                className={`p-2 rounded-lg border-2 transition-all hover:scale-110 ${
                  profile.avatarId === avatar.id
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
                title={avatar.name}
              >
                <AvatarDisplay avatarId={avatar.id} size="md" />
              </button>
            ))}
          </div>
        </div>

        {/* Pseudonym Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Pseudonyme
          </h2>
          <div className="flex gap-2">
            <Input
              value={pseudonym}
              onChange={(e) => setPseudonym(e.target.value)}
              placeholder="Votre pseudonyme"
              className="flex-1"
              maxLength={50}
            />
            <Button
              onClick={handleSavePseudonym}
              disabled={!pseudonym.trim() || pseudonym === profile.pseudonym || saving}
              loading={saving}
            >
              Enregistrer
            </Button>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Ce pseudonyme sera visible par les autres utilisateurs pour identifier votre collection.
          </p>
        </div>

        {/* Preferred Language Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Langue de recherche préférée
          </h2>
          <div className="flex gap-4">
            <button
              onClick={() => handleLanguageChange('fr')}
              className={`px-6 py-3 rounded-lg border-2 transition-all font-medium ${
                preferredLanguage === 'fr'
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
              }`}
            >
              🇫🇷 Français
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-6 py-3 rounded-lg border-2 transition-all font-medium ${
                preferredLanguage === 'en'
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
              }`}
            >
              🇬🇧 English
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Cette langue sera utilisée par défaut pour toutes les recherches de cartes sur Scryfall.
          </p>
        </div>

        {/* Email Section (read-only) */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Email
          </h2>
          <Input
            value={profile.email}
            disabled
            className="bg-gray-100 dark:bg-gray-700"
          />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            L'email ne peut pas être modifié ici.
          </p>
        </div>

        {/* Change Password Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Mot de passe
          </h2>
          {!showPasswordForm ? (
            <div>
              <Button
                onClick={() => setShowPasswordForm(true)}
                variant="secondary"
              >
                Changer le mot de passe
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Mot de passe actuel
                </label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Entrez votre mot de passe actuel"
                  disabled={changingPassword}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Nouveau mot de passe
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Entrez votre nouveau mot de passe (min. 6 caractères)"
                  disabled={changingPassword}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Confirmer le nouveau mot de passe
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmez votre nouveau mot de passe"
                  disabled={changingPassword}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  loading={changingPassword}
                >
                  Enregistrer le nouveau mot de passe
                </Button>
                <Button
                  onClick={() => {
                    setShowPasswordForm(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  variant="secondary"
                  disabled={changingPassword}
                >
                  Annuler
                </Button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Le mot de passe doit contenir au moins 6 caractères.
              </p>
            </div>
          )}
        </div>

        {/* Gestion de la collection */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Gestion de la collection
          </h2>

          {/* Mes collections */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Mes collections
            </h3>
            {loadingUserCollections ? (
              <Spinner size="md" />
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Button variant="secondary" onClick={() => setShowCreateCollectionModal(true)}>
                    Créer une collection
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (userCollections.length > 0 && !importTargetCollectionId) {
                        setImportTargetCollectionId(userCollections[0].id);
                      }
                      setShowImportModal(true);
                    }}
                  >
                    Ajouter des cartes
                  </Button>
                </div>
                {userCollections.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Aucune collection. Créez une collection pour pouvoir y importer des cartes.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {userCollections.map((col) => (
                      <li
                        key={col.id}
                        className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">{col.name}</span>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            className="text-sm px-2 py-1"
                            onClick={() => {
                              setRenameCollectionId(col.id);
                              setRenameCollectionName(col.name);
                              setShowRenameCollectionModal(true);
                            }}
                          >
                            Renommer
                          </Button>
                          <Button
                            variant="danger"
                            className="text-sm px-2 py-1"
                            onClick={() => {
                              setCollectionToDeleteId(col.id);
                              setShowDeleteCollectionConfirm(true);
                            }}
                          >
                            Supprimer
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {importProgress && (
            <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Import en cours...
                  </h3>
                  <div className="flex gap-2">
                    {isImportPaused ? (
                      <Button variant="primary" onClick={() => resumeImport()} className="text-sm px-2 py-1">
                        Reprendre
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => pauseImport()} className="text-sm px-2 py-1">
                        Pause
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => cancelImport()} className="text-sm px-2 py-1">
                      Annuler
                    </Button>
                  </div>
                </div>
                <ProgressBar
                  current={importProgress.current}
                  total={importProgress.total}
                  label={importProgress.currentCard || (isImportPaused ? 'En pause...' : 'Traitement...')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Imports Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Imports
          </h2>
          
          {loadingImports ? (
            <div className="flex justify-center py-4">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Imports actifs */}
              {activeImports.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                    Imports en cours ({activeImports.length})
                  </h3>
                  {activeImports.map((importJob) => (
                    <ImportJobCard
                      key={importJob.id}
                      importJob={importJob}
                      onResume={handleResumeImport}
                      onCancel={handleCancelImport}
                      onViewReport={handleViewReport}
                      onDelete={handleDeleteImport}
                    />
                  ))}
                </div>
              )}

              {/* Imports terminés */}
              {completedImports.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                    Imports terminés ({completedImports.length})
                  </h3>
                  {completedImports.slice(0, 10).map((importJob) => (
                    <ImportJobCard
                      key={importJob.id}
                      importJob={importJob}
                      onViewReport={handleViewReport}
                      onDelete={handleDeleteImport}
                    />
                  ))}
                  {completedImports.length > 10 && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      ... et {completedImports.length - 10} autres imports
                    </p>
                  )}
                </div>
              )}

              {imports.length === 0 && (
                <p className="text-gray-600 dark:text-gray-400">
                  Aucun import pour le moment.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de rapport */}
      <ImportReportModal
        importJob={selectedImport}
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setSelectedImport(null);
        }}
      />

      {/* Modal pour reprendre un import */}
      <Modal
        isOpen={showResumeModal}
        onClose={() => {
          setShowResumeModal(false);
          setResumeImportId(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        title="Reprendre l'import"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Pour reprendre cet import, veuillez sélectionner le même fichier CSV que celui utilisé initialement.
            L'import reprendra automatiquement là où il s'est arrêté.
          </p>
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Fichier CSV
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleResumeFileUpload}
              disabled={resumeImporting}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                dark:file:bg-blue-900 dark:file:text-blue-300
                dark:hover:file:bg-blue-800
                cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          {resumeImporting && (
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Reprise de l'import en cours...
            </p>
          )}
        </div>
      </Modal>

      {/* Modal ajouter des cartes */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          if (newImportFileInputRef.current) {
            newImportFileInputRef.current.value = '';
          }
        }}
        title="Ajouter des cartes à la collection"
      >
        <div className="space-y-4">
          {userCollections.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Collection de destination
              </label>
              <select
                value={importTargetCollectionId ?? ''}
                onChange={(e) => setImportTargetCollectionId(e.target.value === '' ? null : e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {userCollections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Mode d'import
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="add"
                  checked={importMode === 'add'}
                  onChange={(e) => setImportMode(e.target.value as 'add' | 'update')}
                  className="text-blue-600"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  Ajouter à la collection existante
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="update"
                  checked={importMode === 'update'}
                  onChange={(e) => setImportMode(e.target.value as 'add' | 'update')}
                  className="text-blue-600"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  Mettre à jour la collection
                </span>
              </label>
            </div>
          </div>
          <div>
            <input
              ref={newImportFileInputRef}
              type="file"
              accept=".csv"
              onChange={handleNewImportFileUpload}
              className="hidden"
              id="profile-csv-upload"
            />
            <label htmlFor="profile-csv-upload" className="cursor-pointer">
              <span className="inline-block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                {importing ? 'Import en cours...' : 'Sélectionner un fichier CSV'}
              </span>
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showCreateCollectionModal}
        onClose={() => {
          setShowCreateCollectionModal(false);
          setNewCollectionName('');
        }}
        title="Créer une collection"
      >
        <div className="space-y-4">
          <Input
            label="Nom de la collection"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="ex. Ma collection, Trade..."
          />
          <div className="flex gap-2">
            <Button onClick={handleCreateCollection} disabled={!newCollectionName.trim()} loading={creatingCollection}>
              Créer
            </Button>
            <Button variant="secondary" onClick={() => setShowCreateCollectionModal(false)}>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showRenameCollectionModal}
        onClose={() => {
          setShowRenameCollectionModal(false);
          setRenameCollectionId(null);
          setRenameCollectionName('');
        }}
        title="Renommer la collection"
      >
        <div className="space-y-4">
          <Input
            label="Nom"
            value={renameCollectionName}
            onChange={(e) => setRenameCollectionName(e.target.value)}
            placeholder="Nom de la collection"
          />
          <div className="flex gap-2">
            <Button onClick={handleRenameCollection} disabled={!renameCollectionName.trim()} loading={renamingCollection}>
              Enregistrer
            </Button>
            <Button variant="secondary" onClick={() => setShowRenameCollectionModal(false)}>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteCollectionConfirm}
        title="Supprimer cette collection"
        message="Supprimer cette collection et toutes ses cartes ? Cette action est irréversible."
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
        onConfirm={handleDeleteCollectionConfirm}
        onCancel={() => {
          setShowDeleteCollectionConfirm(false);
          setCollectionToDeleteId(null);
        }}
      />
    </div>
  );
}
