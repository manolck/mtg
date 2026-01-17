// src/services/pocketbase.ts
import PocketBase from 'pocketbase';

// Récupérer l'URL depuis les variables d'environnement
const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'http://192.168.1.62:8090';

// Créer une instance singleton
export const pb = new PocketBase(POCKETBASE_URL);

// Optionnel : Configurer l'auto-refresh du token
pb.autoCancellation(false);

export default pb;