import { useState, useEffect } from 'react';
import { Input } from '../components/UI/Input';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { ConfirmDialog } from '../components/UI/ConfirmDialog';
import { createUser, setAdminRole, deleteUserAccount, listUsers } from '../services/adminAuth';
import { isAdmin, getUserRoles } from '../types/user';
import type { UserProfile, AdminUser } from '../types/user';

export function Admin() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // États pour le formulaire de création
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState<AdminUser>({
    email: '',
    password: '',
    roles: ['user'],
  });
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  // États pour la modification
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [updating, setUpdating] = useState(false);

  // État pour la confirmation de suppression
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState<{ uid: string; email: string } | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError('');
      const usersList = await listUsers();
      setUsers(usersList);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser() {
    if (!newUser.email || !newUser.password) {
      setError('Email et mot de passe requis');
      return;
    }

    try {
      setCreating(true);
      setError('');
      const roles = newUserIsAdmin ? ['user', 'admin'] : ['user'];
      await createUser({ ...newUser, roles });
      setSuccess('Utilisateur créé avec succès');
      setNewUser({ email: '', password: '', roles: ['user'] });
      setNewUserIsAdmin(false);
      setShowCreateModal(false);
      await loadUsers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création de l\'utilisateur');
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateUser() {
    if (!editingUser) return;

    try {
      setUpdating(true);
      setError('');
      const newRoles = getUserRoles(editingUser);
      const willBeAdmin = newRoles.includes('admin');
      
      // Mettre à jour les rôles en utilisant setAdminRole qui gère automatiquement le rôle 'user'
      await setAdminRole(editingUser.uid, willBeAdmin);
      
      setSuccess(`Rôles mis à jour avec succès`);
      setShowEditModal(false);
      setEditingUser(null);
      await loadUsers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la mise à jour des rôles');
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeleteUser(uid: string, email: string) {
    setShowDeleteUserConfirm({ uid, email });
  }

  async function confirmDeleteUser() {
    if (!showDeleteUserConfirm) return;

    try {
      setError('');
      await deleteUserAccount(showDeleteUserConfirm.uid);
      setSuccess('Utilisateur supprimé avec succès');
      setShowDeleteUserConfirm(null);
      await loadUsers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la suppression de l\'utilisateur');
    }
  }

  function openEditModal(user: UserProfile) {
    setEditingUser({ ...user });
    setShowEditModal(true);
  }

  function formatDate(date: Date | string) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Gestion des utilisateurs
        </h1>
        <Button onClick={() => setShowCreateModal(true)}>
          + Créer un utilisateur
        </Button>
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-lg">Chargement des utilisateurs...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Aucun utilisateur trouvé.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Pseudonyme
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Rôle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date de création
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={user.uid} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.pseudonym || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {getUserRoles(user).map((role) => (
                          <span
                            key={role}
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              role === 'admin'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            }`}
                          >
                            {role === 'admin' ? 'Admin' : 'User'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => openEditModal(user)}
                          className="text-xs px-2 py-1"
                        >
                          Modifier
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => handleDeleteUser(user.uid, user.email)}
                          className="text-xs px-2 py-1"
                        >
                          Supprimer
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de création */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewUser({ email: '', password: '', role: 'user' });
          setError('');
        }}
        title="Créer un nouvel utilisateur"
      >
        <div className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            required
            autoComplete="email"
          />
          <Input
            label="Mot de passe"
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Rôles
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="mr-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">User (toujours présent)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newUserIsAdmin}
                  onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                  className="mr-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Admin</span>
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Tous les utilisateurs ont le rôle "user" par défaut. Vous pouvez ajouter le rôle "admin" en plus.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewUser({ email: '', password: '', roles: ['user'] });
                setNewUserIsAdmin(false);
                setError('');
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleCreateUser} loading={creating}>
              Créer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de modification */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingUser(null);
          setError('');
        }}
        title="Modifier l'utilisateur"
      >
        {editingUser && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Email
              </label>
              <p className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white">
                {editingUser.email}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                L'email ne peut pas être modifié via cette interface
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Rôles
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="mr-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">User (toujours présent)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isAdmin(editingUser)}
                    onChange={(e) => {
                      const currentRoles = getUserRoles(editingUser);
                      const newRoles = e.target.checked
                        ? (currentRoles.includes('admin') ? currentRoles : [...currentRoles, 'admin'])
                        : currentRoles.filter(r => r !== 'admin');
                      setEditingUser({ ...editingUser, roles: newRoles });
                    }}
                    className="mr-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Admin</span>
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Le rôle "user" est toujours présent. Vous pouvez ajouter ou retirer le rôle "admin" sans modifier le rôle "user".
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                  setError('');
                }}
              >
                Annuler
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                  setError('');
                }}
              >
                Annuler
              </Button>
              <Button onClick={handleUpdateUser} loading={updating}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Dialog de confirmation de suppression */}
      <ConfirmDialog
        isOpen={!!showDeleteUserConfirm}
        onCancel={() => setShowDeleteUserConfirm(null)}
        onConfirm={confirmDeleteUser}
        title="Supprimer l'utilisateur"
        message={`Êtes-vous sûr de vouloir supprimer l'utilisateur ${showDeleteUserConfirm?.email} ? Cette action est irréversible et supprimera toutes ses données.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
      />
    </div>
  );
}

