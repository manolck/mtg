#!/usr/bin/env node
/**
 * Migration (schéma avec tables join) : s'assurer que chaque utilisateur
 * ayant des collection_items possède une collection par défaut "Ma collection".
 *
 * Prérequis : schéma avec cards + collection_items + user_collections.
 * Variables d'environnement : POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL,
 * POCKETBASE_ADMIN_PASSWORD
 *
 * Usage : node scripts/migrate-user-collections.js
 */

import PocketBase from 'pocketbase';

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

const DEFAULT_COLLECTION_NAME = 'Ma collection';

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Définir POCKETBASE_ADMIN_EMAIL et POCKETBASE_ADMIN_PASSWORD');
    process.exit(1);
  }

  const pb = new PocketBase(POCKETBASE_URL);
  try {
    await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  } catch (e) {
    console.error('Échec auth admin:', e.message);
    process.exit(1);
  }

  console.log('Récupération des collection_items...');
  const items = await pb.collection('collection_items').getFullList({
    expand: 'userCollectionId',
    sort: 'created',
  });
  const userIds = new Set();
  for (const item of items) {
    const uid =
      typeof item.userCollectionId === 'object' && item.userCollectionId
        ? item.userCollectionId.userId
        : null;
    if (uid) userIds.add(uid);
  }

  console.log(`${items.length} entrées, ${userIds.size} utilisateur(s).`);

  for (const userId of userIds) {
    const existing = await pb.collection('user_collections').getFullList({
      filter: `userId = "${userId}"`,
    });
    const hasDefault = existing.some((c) => c.name === DEFAULT_COLLECTION_NAME);
    if (hasDefault) {
      console.log(`User ${userId}: a déjà "${DEFAULT_COLLECTION_NAME}", skip.`);
      continue;
    }
    await pb.collection('user_collections').create({
      userId,
      name: DEFAULT_COLLECTION_NAME,
    });
    console.log(`User ${userId}: créé "${DEFAULT_COLLECTION_NAME}".`);
  }

  console.log('Migration terminée.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
