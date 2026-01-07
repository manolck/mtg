import { useState, useEffect } from 'react';
import { Input } from '../components/UI/Input';
import { Button } from '../components/UI/Button';
import { Modal } from '../components/UI/Modal';
import { createUser, updateUser, deleteUserAccount, listUsers } from '../services/adminAuth';
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
    role: 'user',
  });
  const [creating, setCreating] = useState(false);

  // États pour la modification
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [updating, setUpdating] = useState(false);

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
      await createUser(newUser);
      setSuccess('Utilisateur créé avec succès');
      setNewUser({ email: '', password: '', role: 'user' });
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
      await updateUser(editingUser.uid, {
        role: editingUser.role,
      });
      setSuccess('Utilisateur mis à jour avec succès');
      setShowEditModal(false);
      setEditingUser(null);
      await loadUsers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la mise à jour de l\'utilisateur');
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
      await deleteUserAccount(uid);
      setSuccess('Utilisateur supprimé avec succès');
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
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {user.role === 'admin' ? 'Admin' : 'Utilisateur'}
                      </span>
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
              Rôle
            </label>
            <select
              value={newUser.role}
              onChange={(e) =>
                setNewUser({ ...newUser, role: e.target.value as 'admin' | 'user' })
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewUser({ email: '', password: '', role: 'user' });
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
                Rôle
              </label>
              <select
                value={editingUser.role || 'user'}
                onChange={(e) =>
                  setEditingUser({ ...editingUser, role: e.target.value as 'admin' | 'user' })
                }
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="user">Utilisateur</option>
                <option value="admin">Admin</option>
              </select>
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
              <Button onClick={handleUpdateUser} loading={updating}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

