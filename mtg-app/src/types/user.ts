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
  createdAt: Date;
  updatedAt: Date;
}

