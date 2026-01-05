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
  role?: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUser {
  email: string;
  password: string;
  role?: 'admin' | 'user';
}

