#!/usr/bin/env node
/**
 * Migration : ancienne table "collection" (flat) → nouveau schéma "cards" + "collection_items".
 * À exécuter une fois après import du nouveau schéma, si vous aviez des données dans "collection".
 *
 * Prérequis : nouveau schéma (cards, collection_items, user_collections) appliqué.
 * L'ancienne collection "collection" doit encore exister avec les données.
 * Variables d'environnement : POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
 *
 * Usage : node scripts/migrate-from-flat-to-join.js
 */

import PocketBase from 'pocketbase';

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

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

  let oldRecords = [];
  try {
    oldRecords = await pb.collection('collection').getFullList({ sort: 'created' });
  } catch (e) {
    console.error('La collection "collection" n\'existe pas ou est vide:', e.message);
    process.exit(0);
  }

  if (oldRecords.length === 0) {
    console.log('Aucune donnée à migrer.');
    process.exit(0);
  }

  console.log(`${oldRecords.length} enregistrement(s) à migrer.`);

  const userCollectionIdField = 'userCollectionId';
  let created = 0;
  let skipped = 0;

  for (const rec of oldRecords) {
    const collId =
      rec[userCollectionIdField] != null && rec[userCollectionIdField] !== ''
        ? typeof rec[userCollectionIdField] === 'string'
          ? rec[userCollectionIdField]
          : rec[userCollectionIdField]?.id ?? rec[userCollectionIdField]
        : null;

    if (!collId) {
      skipped++;
      continue;
    }

    try {
      const cardPayload = {
        name: rec.name,
        set: rec.set,
        setCode: rec.setCode,
        collectorNumber: rec.collectorNumber,
        rarity: rec.rarity,
        mtgData: rec.mtgData,
        backImageUrl: rec.backImageUrl,
        backMultiverseid: rec.backMultiverseid,
        backMtgData: rec.backMtgData,
      };
      const cardRecord = await pb.collection('cards').create(cardPayload);

      await pb.collection('collection_items').create({
        userCollectionId: collId,
        cardId: cardRecord.id,
        quantity: rec.quantity ?? 1,
        condition: rec.condition ?? undefined,
        language: rec.language ?? 'en',
      });
      created++;
    } catch (e) {
      console.error(`Erreur pour l’enregistrement ${rec.id}:`, e.message);
    }
  }

  console.log(`Terminé : ${created} créés, ${skipped} ignorés (sans collection).`);
  console.log('Vous pouvez supprimer l’ancienne collection "collection" dans l’admin PocketBase.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
