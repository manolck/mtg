export interface User {
  uid: string;
  email: string | null;
  displayName?: string | null;
}

export interface UserProfile {
  uid: string;
  pseudonym?: string;
  avatarId?: string;
  email: string;
  roles?: string[]; // Tableau de rôles : ['user', 'admin'], etc.
  preferredLanguage?: 'en' | 'fr'; // Langue préférée pour les recherches
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUser {
  email: string;
  password: string;
  roles?: string[]; // Tableau de rôles pour la création
}

// Helper functions pour gérer les rôles
export function hasRole(profile: UserProfile | null | undefined, role: string): boolean {
  if (!profile || !profile.roles) return false;
  return profile.roles.includes(role);
}

export function isAdmin(profile: UserProfile | null | undefined): boolean {
  return hasRole(profile, 'admin');
}

export function getUserRoles(profile: UserProfile | null | undefined): string[] {
  if (!profile || !profile.roles || profile.roles.length === 0) {
    return ['user']; // Par défaut, tous les utilisateurs ont le rôle 'user'
  }
  return profile.roles;
}

export function addRole(roles: string[], role: string): string[] {
  if (roles.includes(role)) return roles;
  return [...roles, role];
}

export function removeRole(roles: string[], role: string): string[] {
  return roles.filter(r => r !== role);
}

export function ensureUserRole(roles: string[]): string[] {
  // S'assurer que 'user' est toujours présent
  if (!roles.includes('user')) {
    return ['user', ...roles];
  }
  return roles;
}

