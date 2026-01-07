/**
 * Utilitaires pour IndexedDB
 * Permet de stocker de gros fichiers sans les charger en mémoire
 */

const DB_NAME = 'MTGCollectionDB';
const DB_VERSION = 1;

export interface IDBStore {
  name: string;
  keyPath: string;
  indexes?: Array<{ name: string; keyPath: string; unique?: boolean }>;
}

/**
 * Ouvre la base de données IndexedDB
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store pour les prix MTGJSON
      if (!db.objectStoreNames.contains('mtgjson_prices')) {
        const priceStore = db.createObjectStore('mtgjson_prices', { keyPath: 'cardName' });
        priceStore.createIndex('cardName', 'cardName', { unique: true });
      }

      // Store pour les métadonnées
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    };
  });
}

/**
 * Stocke une valeur dans IndexedDB
 */
export async function setItem<T>(storeName: string, key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put({ key, value });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Récupère une valeur depuis IndexedDB
 */
export async function getItem<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.value : null);
    };
  });
}

/**
 * Supprime une valeur depuis IndexedDB
 */
export async function removeItem(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Vérifie si une clé existe dans IndexedDB
 */
export async function hasItem(storeName: string, key: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result !== undefined);
  });
}

/**
 * Stocke le fichier brut dans IndexedDB (sans le parser)
 */
export async function storeRawFile(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['metadata'], 'readwrite');
    const store = transaction.objectStore('metadata');
    const request = store.put({ key, value: blob });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Récupère le fichier brut depuis IndexedDB
 */
export async function getRawFile(key: string): Promise<Blob | null> {
  return getItem<Blob>('metadata', key);
}

