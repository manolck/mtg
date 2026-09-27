#!/usr/bin/env node

/**
 * Script pour scraper toutes les cartes Magic: The Gathering depuis MagicCorporation.com
 * 
 * Ce script récupère toutes les cartes disponibles sur le site (949 pages, ~47,447 cartes)
 * et les sauvegarde dans un fichier JSON.
 * 
 * Usage:
 * node scripts/scrape-magiccorporation.js
 * 
 * Options:
 * --start-page=N    : Commencer à la page N (défaut: 1)
 * --end-page=N      : Terminer à la page N (défaut: 949)
 * --output=FILE     : Fichier de sortie (défaut: magiccorporation-cards.json)
 * --delay=MS        : Délai entre les requêtes en ms (défaut: 1000)
 * --resume          : Reprendre depuis le dernier point sauvegardé
 * --ndjson          : Émettre la progression en JSON ligne par ligne (admin SSE)
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration par défaut
const DEFAULT_CONFIG = {
  startPage: 1,
  endPage: 949,
  outputFile: 'magiccorporation-cards.json',
  delay: 1000, // 1 seconde entre les requêtes pour être respectueux
  resume: false,
  ndjson: false,
};

// Parser les arguments de ligne de commande
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  for (const arg of args) {
    if (arg.startsWith('--start-page=')) {
      config.startPage = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--end-page=')) {
      config.endPage = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      config.outputFile = arg.split('=')[1];
    } else if (arg.startsWith('--delay=')) {
      config.delay = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--resume') {
      config.resume = true;
    } else if (arg === '--ndjson') {
      config.ndjson = true;
    }
  }
  
  return config;
}

function emitNdjson(config, payload) {
  if (!config.ndjson) return;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function logLine(config, message) {
  if (config.ndjson) {
    emitNdjson(config, { type: 'log', message });
  } else {
    console.log(message);
  }
}

// Fonction pour faire une pause
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fonction pour récupérer le HTML d'une page
async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Charset': 'UTF-8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Récupérer le texte en gérant l'encodage
    // Le site utilise probablement ISO-8859-1 ou Windows-1252
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('windows-1252'); // Encodage français commun
    const html = decoder.decode(buffer);
    
    return html;
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération de la page: ${error.message}`);
    throw error;
  }
}

// Fonction pour parser le HTML et extraire les cartes
function parseCards(html) {
  const cards = [];
  const $ = cheerio.load(html);
  
  // Trouver le tableau des résultats
  // Le tableau contient les cartes dans des lignes <tr>
  $('table tr').each((index, element) => {
    const $row = $(element);
    const $cells = $row.find('td');
    
    // Ignorer les lignes d'en-tête ou les lignes vides
    if ($cells.length < 9 || $row.find('th').length > 0) {
      return;
    }
    
    try {
      const card = parseCardRow($cells, $);
      if (card && card.nameVo) {
        cards.push(card);
      }
    } catch (error) {
      // Ignorer les erreurs de parsing pour une ligne spécifique
      console.warn(`⚠️  Erreur lors du parsing d'une ligne: ${error.message}`);
    }
  });
  
  return cards;
}

// Fonction pour parser une ligne de carte
function parseCardRow($cells, $) {
  if ($cells.length < 9) {
    return null; // Pas assez de colonnes
  }
  
  // Structure attendue (basée sur l'analyse):
  // 0: Couleur (image)
  // 1: Rareté (image)
  // 2: Numéro
  // 3: Nom VO (lien)
  // 4: Nom VF (lien)
  // 5: Mana (images)
  // 6: Type
  // 7: Force/Endurance (F/E)
  // 8: Édition (lien)
  
  // Extraire le nom VO
  const $nameVoLink = $($cells[3]).find('a').first();
  const nameVo = $nameVoLink.text().trim() || null;
  let cardUrl = $nameVoLink.attr('href') || null;
  if (cardUrl && !cardUrl.startsWith('http')) {
    cardUrl = `http://www.magiccorporation.com${cardUrl}`;
  }
  
  // Extraire le nom VF
  const $nameVfLink = $($cells[4]).find('a').first();
  const nameVf = $nameVfLink.text().trim() || null;
  
  // Extraire le numéro
  const numberText = $($cells[2]).text().trim();
  const number = numberText.replace(/[^\d]/g, '') || null;
  
  // Extraire le type
  const type = $($cells[6]).text().trim() || null;
  
  // Extraire Force/Endurance
  const powerToughness = $($cells[7]).text().trim() || null;
  let power = null;
  let toughness = null;
  if (powerToughness && powerToughness.includes('/')) {
    const parts = powerToughness.split('/');
    power = parts[0].trim();
    toughness = parts[1].trim();
  }
  
  // Extraire l'édition
  const $editionLink = $($cells[8]).find('a').first();
  const edition = $editionLink.text().trim() || null;
  
  // Extraire le mana cost (images de mana)
  const manaCostParts = [];
  $($cells[5]).find('img').each((i, img) => {
    const src = $(img).attr('src') || '';
    const match = src.match(/manas\/micro\/([^"\/]+)\.gif/i);
    if (match) {
      const mana = match[1].toLowerCase();
      if (mana === 'x') manaCostParts.push('{X}');
      else if (mana === 'w') manaCostParts.push('{W}');
      else if (mana === 'u') manaCostParts.push('{U}');
      else if (mana === 'b') manaCostParts.push('{B}');
      else if (mana === 'r') manaCostParts.push('{R}');
      else if (mana === 'g') manaCostParts.push('{G}');
      else if (/^\d+$/.test(mana)) manaCostParts.push(`{${mana}}`);
      else manaCostParts.push(`{${mana.toUpperCase()}}`);
    }
  });
  const manaCost = manaCostParts.join('') || null;
  
  // Extraire la couleur
  const $colorImg = $($cells[0]).find('img').first();
  const colorSrc = $colorImg.attr('src') || '';
  const colorMatch = colorSrc.match(/couleurs\/micro\/([^"\/]+)\.gif/i);
  const color = colorMatch ? colorMatch[1].toUpperCase() : null;
  
  // Extraire la rareté
  const $rarityImg = $($cells[1]).find('img').first();
  const raritySrc = $rarityImg.attr('src') || '';
  const rarityMatch = raritySrc.match(/rarete\/icon\/([^"\/]+)\.gif/i);
  const rarity = rarityMatch ? rarityMatch[1].toUpperCase() : null;
  
  if (!nameVo) {
    return null;
  }
  
  return {
    nameVo,
    nameVf: nameVf || nameVo,
    number,
    type,
    power,
    toughness,
    edition,
    manaCost,
    color,
    rarity,
    cardUrl,
    scrapedAt: new Date().toISOString(),
  };
}

// Fonction pour extraire les informations de pagination depuis le HTML
function extractPaginationInfo(html) {
  const $ = cheerio.load(html);
  
  // Chercher les liens de pagination
  // Format typique: "Page n°1/949 - 1 2 3 ... 949 >"
  // Le texte peut être dans différents endroits
  const paginationText = $('body').text();
  
  // Essayer plusieurs patterns
  let pageMatch = paginationText.match(/Page n[°o]\s*(\d+)\s*\/\s*(\d+)/i);
  if (!pageMatch) {
    pageMatch = paginationText.match(/Total\s*:\s*\d+[^\d]*Page[^\d]*(\d+)\s*\/\s*(\d+)/i);
  }
  if (!pageMatch) {
    // Chercher dans les liens de pagination
    const paginationLinks = $('a[href*="page"], a[href*="p="]');
    if (paginationLinks.length > 0) {
      // Essayer d'extraire depuis les liens
      const lastLink = paginationLinks.last();
      const href = lastLink.attr('href') || '';
      const pageMatchInHref = href.match(/[?&](?:page|p)=(\d+)/i);
      if (pageMatchInHref) {
        const maxPage = parseInt(pageMatchInHref[1], 10);
        // Chercher la page actuelle
        const currentPageMatch = paginationText.match(/Page[^\d]*(\d+)/i);
        const currentPage = currentPageMatch ? parseInt(currentPageMatch[1], 10) : 1;
        return {
          currentPage,
          totalPages: maxPage,
        };
      }
    }
  }
  
  if (pageMatch) {
    return {
      currentPage: parseInt(pageMatch[1], 10),
      totalPages: parseInt(pageMatch[2], 10),
    };
  }
  
  return null;
}

// Fonction pour construire l'URL d'une page
function buildPageUrl(pageNumber) {
  const baseUrl = 'http://www.magiccorporation.com/mc.php';
  
  // Construire les paramètres comme dans l'URL originale
  const params = new URLSearchParams();
  params.append('rub', 'cartes');
  params.append('op', 'search');
  params.append('search', '2');
  params.append('num_couleur[0]', '1');
  params.append('num_couleur[1]', '2');
  params.append('num_couleur[2]', '3');
  params.append('num_couleur[3]', '4');
  params.append('num_couleur[4]', '5');
  params.append('bool_mana', '0');
  params.append('mode', 'list');
  params.append('lang_vf', '1');
  params.append('lang_vo', '1');
  params.append('nom', '');
  params.append('nom_type', '');
  params.append('texte', '');
  params.append('cout_mana_egal', '');
  params.append('cout_mana_maxi', '');
  params.append('cout_mana_mini', '');
  params.append('force_egal', '');
  params.append('force_maxi', '');
  params.append('force_mini', '');
  params.append('endurance_egal', '');
  params.append('endurance_maxi', '');
  params.append('endurance_mini', '');
  params.append('bool_type', '1');
  params.append('bool_creature', '1');
  params.append('bool_capacite', '0');
  params.append('bool_illustrateur', '1');
  params.append('limit', '0');
  
  // Le site utilise probablement un paramètre de pagination
  // D'après l'analyse, essayer avec 'page' ou 'p' ou 'offset'
  // Si pageNumber > 1, ajouter le paramètre de pagination
  if (pageNumber > 1) {
    // Essayer avec 'page' d'abord
    params.append('page', pageNumber.toString());
  }
  
  return `${baseUrl}?${params.toString()}`;
}

// Fonction principale
async function main() {
  const config = parseArgs();
  
  logLine(config, '=== Scraper MagicCorporation ===');
  logLine(config, `Pages: ${config.startPage} à ${config.endPage}`);
  logLine(config, `Fichier de sortie: ${config.outputFile}`);
  logLine(config, `Délai entre requêtes: ${config.delay}ms`);
  emitNdjson(config, {
    type: 'progress',
    phase: 'start',
    page: 0,
    totalPages: Math.max(1, config.endPage - config.startPage + 1),
    cards: 0,
    percent: 0,
  });
  
  // Charger les données existantes si on reprend
  let allCards = [];
  let startPage = config.startPage;
  
  if (config.resume && existsSync(config.outputFile)) {
    try {
      const existingData = JSON.parse(readFileSync(config.outputFile, 'utf8'));
      if (Array.isArray(existingData)) {
        allCards = existingData;
        logLine(config, `${allCards.length} cartes déjà chargées depuis ${config.outputFile}`);
        // Déterminer la dernière page traitée (approximatif)
        startPage = Math.max(config.startPage, Math.floor(allCards.length / 50) + 1);
        logLine(config, `Reprise à partir de la page ${startPage}`);
      }
    } catch (error) {
      logLine(config, `Impossible de charger le fichier existant: ${error.message}`);
      logLine(config, 'Démarrage depuis le début');
    }
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  // Créer un fichier de sauvegarde temporaire pour la progression
  const progressFile = config.outputFile.replace(/\.json$/i, '.progress.json');
  
  // Détecter le nombre total de pages depuis la première page si nécessaire
  let detectedTotalPages = config.endPage;
  if (startPage === 1) {
    try {
      logLine(config, 'Détection du nombre total de pages...');
      const firstPageUrl = buildPageUrl(1);
      const firstPageHtml = await fetchPage(firstPageUrl);
      const paginationInfo = extractPaginationInfo(firstPageHtml);
      if (paginationInfo && paginationInfo.totalPages) {
        detectedTotalPages = paginationInfo.totalPages;
        logLine(config, `${detectedTotalPages} pages détectées`);
        // Ajuster endPage si nécessaire
        if (config.endPage > detectedTotalPages) {
          config.endPage = detectedTotalPages;
          logLine(config, `Ajustement: fin à la page ${detectedTotalPages}`);
        }
      }
      await sleep(config.delay);
    } catch (error) {
      logLine(config, `Impossible de détecter le nombre de pages: ${error.message}`);
      logLine(config, `Utilisation de la valeur par défaut: ${config.endPage} pages`);
    }
  }

  const totalPages = Math.max(1, config.endPage - startPage + 1);
  
  for (let page = startPage; page <= config.endPage; page++) {
    try {
      logLine(config, `Page ${page}/${config.endPage}...`);
      
      const url = buildPageUrl(page);
      const html = await fetchPage(url);
      
      // Vérifier la pagination pour s'assurer qu'on est sur la bonne page
      const paginationInfo = extractPaginationInfo(html);
      if (paginationInfo && paginationInfo.currentPage !== page) {
        logLine(config, `Page détectée: ${paginationInfo.currentPage}, attendue: ${page}`);
        // Ajuster si nécessaire
        if (paginationInfo.totalPages) {
          detectedTotalPages = paginationInfo.totalPages;
        }
      }
      
      const cards = parseCards(html);
      
      if (cards.length === 0) {
        logLine(config, `Aucune carte trouvée sur la page ${page}`);
        errorCount++;
      } else {
        allCards.push(...cards);
        successCount++;
        logLine(config, `${cards.length} cartes extraites (Total: ${allCards.length})`);
      }

      const donePages = page - startPage + 1;
      emitNdjson(config, {
        type: 'progress',
        phase: 'page',
        page,
        totalPages: config.endPage,
        donePages,
        spanPages: totalPages,
        cards: allCards.length,
        percent: Math.min(99, Math.round((donePages / totalPages) * 100)),
        pageErrors: errorCount,
      });
      
      // Sauvegarder la progression toutes les 10 pages
      if (page % 10 === 0 || page === config.endPage) {
        writeFileSync(config.outputFile, JSON.stringify(allCards, null, 2), 'utf8');
        writeFileSync(progressFile, JSON.stringify({
          lastPage: page,
          totalCards: allCards.length,
          timestamp: new Date().toISOString(),
        }, null, 2), 'utf8');
        logLine(config, `Progression sauvegardée (${allCards.length} cartes)`);
      }
      
      // Délai entre les requêtes pour être respectueux
      if (page < config.endPage) {
        await sleep(config.delay);
      }
      
    } catch (error) {
      logLine(config, `Erreur sur la page ${page}: ${error.message}`);
      emitNdjson(config, {
        type: 'page_error',
        page,
        message: error.message || String(error),
      });
      errorCount++;
      
      // En cas d'erreur, attendre un peu plus avant de continuer
      await sleep(config.delay * 2);
    }
  }
  
  // Sauvegarde finale
  writeFileSync(config.outputFile, JSON.stringify(allCards, null, 2), 'utf8');
  
  // Supprimer le fichier de progression
  if (existsSync(progressFile)) {
    unlinkSync(progressFile);
  }

  const uniqueCards = new Set(allCards.map(c => c.nameVo)).size;
  const withVf = allCards.filter(c => c.nameVf && c.nameVf !== c.nameVo).length;
  
  logLine(config, '=== Scraping terminé ===');
  logLine(config, `Pages réussies: ${successCount}/${totalPages}`);
  logLine(config, `Pages en erreur: ${errorCount}/${totalPages}`);
  logLine(config, `Total de cartes: ${allCards.length}`);
  logLine(config, `Fichier sauvegardé: ${config.outputFile}`);
  logLine(config, `Cartes uniques (VO): ${uniqueCards}`);
  logLine(config, `Cartes avec nom VF: ${withVf}`);

  emitNdjson(config, {
    type: 'done',
    ok: true,
    cards: allCards.length,
    uniqueCards,
    withVf,
    pageErrors: errorCount,
    outputFile: config.outputFile,
    percent: 100,
  });
}

// Exporter les fonctions pour les tests
export { fetchPage, parseCards, buildPageUrl, extractPaginationInfo };

// Exécuter main() seulement si le script est exécuté directement
// Vérifier si le script est exécuté directement (pas importé)
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.endsWith('scrape-magiccorporation.js');

if (isMainModule) {
  // Gestion des erreurs non capturées
  process.on('unhandledRejection', (error) => {
    console.error('❌ Erreur non gérée:', error);
    process.exit(1);
  });

  main().catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
}

