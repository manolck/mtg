#!/usr/bin/env node
/**
 * Migrate decks from legacy flat { cardId, quantity } (collection_items ids)
 * to catalog-first { mainboard, sideboard, maybeboard } with scryfallId.
 *
 * Usage:
 *   POCKETBASE_URL=http://127.0.0.1:8090 POCKETBASE_ADMIN_EMAIL=... POCKETBASE_ADMIN_PASSWORD=... node scripts/migrate-decks-catalog.js
 *
 * Requires PocketBase fields: format, visibility, commanders, description, sourceDeckId, isValidForFormat, tags.
 */

import PocketBase from 'pocketbase';

const url = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const email = process.env.POCKETBASE_ADMIN_EMAIL;
const password = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(url);

async function resolveCollectionItem(itemId) {
  try {
    const item = await pb.collection('collection_items').getOne(itemId, { expand: 'cardId' });
    const card = item.expand?.cardId || item;
    const scryfallId =
      card.scryfallId ||
      card.mtgData?.id ||
      item.scryfallId ||
      null;
    const name = card.name || item.name || 'Unknown';
    return {
      scryfallId: scryfallId || `legacy:${itemId}`,
      name,
      setCode: card.setCode || card.set || undefined,
      collectorNumber: card.collectorNumber || card.number || undefined,
      quantity: 1,
      cmc: card.mtgData?.cmc,
      typeLine: card.mtgData?.type,
      manaCost: card.mtgData?.manaCost,
      rarity: card.rarity || card.mtgData?.rarity,
      imageUrl: card.mtgData?.imageUrl,
    };
  } catch {
    return {
      scryfallId: `legacy:${itemId}`,
      name: `Carte non migrée (${String(itemId).slice(0, 8)})`,
      quantity: 1,
    };
  }
}

function looksZoned(cards) {
  return (
    cards &&
    typeof cards === 'object' &&
    !Array.isArray(cards) &&
    ('mainboard' in cards || 'sideboard' in cards)
  );
}

async function main() {
  await pb.admins.authWithPassword(email, password);
  const decks = await pb.collection('decks').getFullList();
  console.log(`Found ${decks.length} decks`);

  let updated = 0;
  for (const deck of decks) {
    const patch = {};

    if (!deck.format) patch.format = 'modern';
    if (!deck.visibility) patch.visibility = 'private';
    if (deck.commanders == null) patch.commanders = [];
    if (deck.isValidForFormat == null) patch.isValidForFormat = false;
    if (deck.tags == null) patch.tags = [];
    if (deck.description == null) patch.description = '';

    if (!looksZoned(deck.cards)) {
      const mainboard = [];
      const rawList = Array.isArray(deck.cards)
        ? deck.cards
        : Array.isArray(deck.cards?.items)
          ? deck.cards.items
          : [];

      for (const row of rawList) {
        const qty = typeof row.quantity === 'number' ? row.quantity : 1;
        if (row.scryfallId && row.name) {
          mainboard.push({ ...row, quantity: qty });
          continue;
        }
        if (row.cardId) {
          const entry = await resolveCollectionItem(row.cardId);
          entry.quantity = qty;
          mainboard.push(entry);
        }
      }

      patch.cards = { mainboard, sideboard: [], maybeboard: [] };
    }

    if (Object.keys(patch).length === 0) continue;

    await pb.collection('decks').update(deck.id, patch);
    updated++;
    console.log(`Updated deck ${deck.id} (${deck.name})`);
  }

  console.log(`Done. Updated ${updated} decks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
