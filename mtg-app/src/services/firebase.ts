import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Initialize Firebase only if config is valid
let app: FirebaseApp | undefined;
let auth: Auth;
let db: Firestore;

try {
  // Check if we have at least the required config
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    console.warn('Firebase configuration is missing. Please create a .env.local file with your Firebase credentials.');
    // Create a minimal Firebase app for development
    const dummyConfig = {
      apiKey: 'dummy',
      authDomain: 'dummy',
      projectId: 'dummy',
      messagingSenderId: 'dummy',
      appId: 'dummy',
    };
    app = initializeApp(dummyConfig, 'dummy');
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (error) {
  console.error('Error initializing Firebase:', error);
  // Fallback to dummy app
  const dummyConfig = {
    apiKey: 'dummy',
    authDomain: 'dummy',
    projectId: 'dummy',
    storageBucket: 'dummy',
    messagingSenderId: 'dummy',
    appId: 'dummy',
  };
  app = initializeApp(dummyConfig, 'dummy-fallback');
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };
export default app;

