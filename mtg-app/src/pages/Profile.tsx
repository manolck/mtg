import { useState, useEffect, useRef } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useImports } from '../hooks/useImports';
import { useCollection } from '../hooks/useCollection';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { AvatarDisplay } from '../components/UI/AvatarDisplay';
import { ImportJobCard } from '../components/Import/ImportJobCard';
import { ImportReportModal } from '../components/Import/ImportReportModal';
import { Modal } from '../components/UI/Modal';
import { AVATARS } from '../data/avatars';
import type { ImportJob } from '../types/import';

export function Profile() {
  const { profile, loading, error, updateProfile } = useProfile();
  const { imports, loading: loadingImports, updateImportStatus, deleteImport } = useImports();
  const { importCSV, resumeImport, cancelImport } = useCollection();
  const [pseudonym, setPseudonym] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedImport, setSelectedImport] = useState<ImportJob | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeImportId, setResumeImportId] = useState<string | null>(null);
  const [resumeImporting, setResumeImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialiser le pseudonyme quand le profil est chargé
  useEffect(() => {
    if (profile) {
      setPseudonym(profile.pseudonym || '');
    }
  }, [profile]);

  const handleSavePseudonym = async () => {
    if (!pseudonym.trim()) {
      alert('Le pseudonyme ne peut pas être vide');
      return;
    }

    try {
      setSaving(true);
      await updateProfile({ pseudonym: pseudonym.trim() });
      alert('Pseudonyme mis à jour avec succès !');
    } catch (err) {
      console.error('Error saving pseudonym:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSelect = async (avatarId: string) => {
    if (profile?.avatarId === avatarId) {
      return; // Déjà sélectionné
    }

    try {
      await updateProfile({ avatarId });
    } catch (err) {
      console.error('Error updating avatar:', err);
      alert('Erreur lors de la mise à jour de l\'avatar');
    }
  };

  const handleResumeImport = async (importId: string) => {
    try {
      setResumeImporting(true);
      
      // Trouver l'import dans la liste
      const importJob = imports.find(imp => imp.id === importId);
      
      if (!importJob) {
        alert('Import introuvable');
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
    } catch (err) {
      console.error('Error resuming import:', err);
      alert('Erreur lors de la reprise de l\'import');
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
    } catch (err) {
      console.error('Error resuming import:', err);
      alert('Erreur lors de la reprise de l\'import');
    } finally {
      setResumeImporting(false);
    }
  };

  const handleCancelImport = async (importId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cet import ?')) {
      return;
    }
    try {
      await updateImportStatus(importId, 'cancelled');
      cancelImport();
    } catch (err) {
      console.error('Error cancelling import:', err);
      alert('Erreur lors de l\'annulation de l\'import');
    }
  };

  const handleViewReport = (importJob: ImportJob) => {
    setSelectedImport(importJob);
    setShowReportModal(true);
  };

  const handleDeleteImport = async (importId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet import ?')) {
      return;
    }
    try {
      await deleteImport(importId);
    } catch (err) {
      console.error('Error deleting import:', err);
      alert('Erreur lors de la suppression de l\'import');
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
        <p className="text-lg">Chargement du profil...</p>
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

        {/* Imports Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Imports
          </h2>
          
          {loadingImports ? (
            <p className="text-gray-600 dark:text-gray-400">Chargement des imports...</p>
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
    </div>
  );
}
