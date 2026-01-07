import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const MTGJSON_PRICES_URL = 'https://mtgjson.com/api/v5/AllPrices.json';
const UPDATE_INTERVAL_DAYS = 15; // Mise à jour 2 fois par mois

interface CardPriceData {
  [setCode: string]: {
    paper?: {
      cardmarket?: {
        retail?: {
          normal?: number;
          foil?: number;
        };
      };
      tcgplayer?: {
        retail?: {
          normal?: number;
          foil?: number;
        };
      };
    };
    mtgo?: {
      cardhoarder?: {
        retail?: {
          normal?: number;
          foil?: number;
        };
      };
    };
  };
}

interface MTGJSONPriceData {
  data: {
    [cardName: string]: CardPriceData;
  };
  meta?: {
    date?: string;
    version?: string;
  };
}

/**
 * Extrait les prix depuis les données d'un set
 */
function extractPriceFromSetData(setData: any): {
  usd?: string;
  usdFoil?: string;
  eur?: string;
  eurFoil?: string;
  tix?: string;
} | null {
  const prices: {
    usd?: string;
    usdFoil?: string;
    eur?: string;
    eurFoil?: string;
    tix?: string;
  } = {};

  if (setData.paper?.cardmarket?.retail) {
    const cardmarket = setData.paper.cardmarket.retail;
    if (cardmarket.normal !== undefined) {
      prices.eur = cardmarket.normal.toString();
    }
    if (cardmarket.foil !== undefined) {
      prices.eurFoil = cardmarket.foil.toString();
    }
  }

  if (setData.paper?.tcgplayer?.retail) {
    const tcgplayer = setData.paper.tcgplayer.retail;
    if (tcgplayer.normal !== undefined) {
      prices.usd = tcgplayer.normal.toString();
    }
    if (tcgplayer.foil !== undefined) {
      prices.usdFoil = tcgplayer.foil.toString();
    }
  }

  if (setData.mtgo?.cardhoarder?.retail) {
    const cardhoarder = setData.mtgo.cardhoarder.retail;
    if (cardhoarder.normal !== undefined) {
      prices.tix = cardhoarder.normal.toString();
    }
  }

  if (!prices.usd && !prices.eur && !prices.tix) {
    return null;
  }

  return prices;
}

/**
 * Télécharge et indexe le fichier MTGJSON dans Firestore
 */
async function downloadAndIndexPrices(): Promise<void> {
  console.log('Downloading MTGJSON prices file...');
  const response = await fetch(MTGJSON_PRICES_URL);
  
  if (!response.ok) {
    throw new Error(`Failed to download prices: ${response.status}`);
  }

  const data: MTGJSONPriceData = await response.json();
  console.log(`Downloaded MTGJSON prices file (${Object.keys(data.data).length} cards)`);

  // Indexer chaque carte dans Firestore
  const db = admin.firestore();
  const batch = db.batch();
  let batchCount = 0;
  const BATCH_SIZE = 500; // Limite Firestore

  for (const [cardName, cardData] of Object.entries(data.data)) {
    // Créer un document pour chaque carte avec ses prix
    const cardRef = db.collection('mtgjson_prices').doc(cardName);
    
    // Extraire les prix de tous les sets pour cette carte
    const pricesBySet: { [setCode: string]: any } = {};
    for (const [setCode, setData] of Object.entries(cardData)) {
      const prices = extractPriceFromSetData(setData);
      if (prices) {
        pricesBySet[setCode] = prices;
      }
    }

    if (Object.keys(pricesBySet).length > 0) {
      batch.set(cardRef, {
        cardName,
        pricesBySet,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      batchCount++;
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        console.log(`Indexed ${batchCount} cards...`);
        batchCount = 0;
      }
    }
  }

  // Commit le dernier batch
  if (batchCount > 0) {
    await batch.commit();
  }

  // Mettre à jour la date de dernière mise à jour
  await db.collection('metadata').doc('mtgjson_prices').set({
    lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
    version: data.meta?.version || 'unknown',
    totalCards: Object.keys(data.data).length,
  });

  console.log(`Successfully indexed ${Object.keys(data.data).length} cards`);
}

/**
 * Cloud Function pour télécharger et indexer les prix MTGJSON
 * Appelée manuellement ou via un cron job
 */
export const updateMTGJSONPrices = functions.https.onRequest(async (req, res) => {
  // Configuration CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Gérer les requêtes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    await downloadAndIndexPrices();
    res.json({ success: true, message: 'Prices updated successfully' });
  } catch (error: any) {
    console.error('Error updating prices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Cloud Function cron pour mise à jour automatique 2 fois par mois
 * S'exécute le 1er et le 15 de chaque mois à 2h du matin
 */
export const scheduledUpdateMTGJSONPrices = functions.pubsub
  .schedule('0 2 1,15 * *') // 2h du matin, 1er et 15 de chaque mois
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    try {
      console.log('Scheduled update of MTGJSON prices');
      await downloadAndIndexPrices();
      console.log('Scheduled update completed successfully');
    } catch (error: any) {
      console.error('Error in scheduled update:', error);
      throw error;
    }
  });

/**
 * API pour rechercher le prix d'une carte
 * GET /getCardPrice?cardName=Lightning Bolt&setCode=LEA
 */
export const getCardPrice = functions.https.onRequest(async (req, res) => {
  // Configuration CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Gérer les requêtes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const cardName = req.query.cardName as string;
    const setCode = req.query.setCode as string | undefined;

    if (!cardName) {
      res.status(400).json({ error: 'cardName parameter is required' });
      return;
    }

    const db = admin.firestore();
    const cardDoc = await db.collection('mtgjson_prices').doc(cardName).get();

    if (!cardDoc.exists) {
      // Essayer une recherche insensible à la casse en parcourant les documents
      // Note: Firestore ne supporte pas bien la recherche insensible à la casse
      // On pourrait créer un index avec cardNameLowerCase, mais pour simplifier,
      // on essaie quelques variantes courantes
      const variations = [
        cardName.charAt(0).toUpperCase() + cardName.slice(1).toLowerCase(),
        cardName.toUpperCase(),
        cardName.toLowerCase(),
      ];

      for (const variation of variations) {
        const variantDoc = await db.collection('mtgjson_prices').doc(variation).get();
        if (variantDoc.exists) {
          const data = variantDoc.data();
          const pricesBySet = data?.pricesBySet || {};

          if (setCode && pricesBySet[setCode.toUpperCase()]) {
            res.json({ price: pricesBySet[setCode.toUpperCase()] });
            return;
          } else if (Object.keys(pricesBySet).length > 0) {
            const firstSet = Object.keys(pricesBySet)[0];
            res.json({ price: pricesBySet[firstSet] });
            return;
          }
        }
      }

      res.json({ price: null });
      return;
    }

    const data = cardDoc.data();
    const pricesBySet = data?.pricesBySet || {};

    if (setCode && pricesBySet[setCode.toUpperCase()]) {
      res.json({ price: pricesBySet[setCode.toUpperCase()] });
    } else if (Object.keys(pricesBySet).length > 0) {
      // Prendre le premier set disponible
      const firstSet = Object.keys(pricesBySet)[0];
      res.json({ price: pricesBySet[firstSet] });
    } else {
      res.json({ price: null });
    }
  } catch (error: any) {
    console.error('Error getting card price:', error);
    res.status(500).json({ error: error.message });
  }
});

