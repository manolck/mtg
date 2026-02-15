#!/usr/bin/env node
/**
 * Migration : créer une collection par défaut "Ma collection" pour chaque
 * utilisateur ayant des cartes, et lier ces cartes à cette collection.
 *
 * Prérequis :
 * - PocketBase avec la collection user_collections créée et le champ
 *   collectionId ajouté à la collection (cartes).
 * - Variables d'environnement : POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL,
 *   POCKETBASE_ADMIN_PASSWORD
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

  console.log('Récupération des cartes...');
  const cards = await pb.collection('collection').getFullList({ sort: 'userId' });
  const byUser = new Map();
  for (const card of cards) {
    const uid = typeof card.userId === 'string' ? card.userId : card.userId?.id ?? card.userId;
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(card);
  }

  console.log(`${cards.length} cartes, ${byUser.size} utilisateur(s).`);

  for (const [userId, userCards] of byUser) {
    const withCollection = userCards.filter((c) => c.collectionId != null && c.collectionId !== '');
    if (withCollection.length === userCards.length) {
      console.log(`User ${userId}: toutes les cartes ont déjà un collectionId, skip.`);
      continue;
    }

    let defaultColl;
    const existing = await pb.collection('user_collections').getFullList({
      filter: `userId = "${userId}"`,
    });
    const named = existing.find((c) => c.name === DEFAULT_COLLECTION_NAME);
    if (named) {
      defaultColl = named;
      console.log(`User ${userId}: collection existante "${defaultColl.name}" (${defaultColl.id}).`);
    } else {
      defaultColl = await pb.collection('user_collections').create({
        userId,
        name: DEFAULT_COLLECTION_NAME,
      });
      console.log(`User ${userId}: créé "${defaultColl.name}" (${defaultColl.id}).`);
    }

    const toUpdate = userCards.filter((c) => !c.collectionId || c.collectionId === '');
    for (const card of toUpdate) {
      await pb.collection('collection').update(card.id, { collectionId: defaultColl.id });
    }
    console.log(`User ${userId}: ${toUpdate.length} carte(s) mises à jour.`);
  }

  console.log('Migration terminée.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
