#!/usr/bin/env node

/**
 * Script de test pour valider le scraping d'une seule page
 * 
 * Usage:
 * node scripts/test-scraping.js [page-number]
 */

// Import des fonctions depuis le script principal
import { fetchPage, parseCards, buildPageUrl, extractPaginationInfo } from './scrape-magiccorporation.js';

async function testScraping(pageNumber = 1) {
  console.log(`🧪 Test du scraping - Page ${pageNumber}\n`);
  
  try {
    const url = buildPageUrl(pageNumber);
    console.log(`📡 URL: ${url}\n`);
    
    console.log('⏳ Récupération de la page...');
    const html = await fetchPage(url);
    console.log(`✅ HTML récupéré (${html.length} caractères)\n`);
    
    console.log('🔍 Extraction des informations de pagination...');
    const paginationInfo = extractPaginationInfo(html);
    if (paginationInfo) {
      console.log(`✅ Page actuelle: ${paginationInfo.currentPage}`);
      console.log(`✅ Total de pages: ${paginationInfo.totalPages}\n`);
    } else {
      console.log('⚠️  Informations de pagination non trouvées\n');
    }
    
    console.log('📋 Parsing des cartes...');
    const cards = parseCards(html);
    console.log(`✅ ${cards.length} cartes extraites\n`);
    
    if (cards.length > 0) {
      console.log('📊 Exemple de cartes extraites:\n');
      cards.slice(0, 5).forEach((card, index) => {
        console.log(`${index + 1}. ${card.nameVo} (${card.nameVf})`);
        console.log(`   Type: ${card.type || 'N/A'}`);
        console.log(`   Mana: ${card.manaCost || 'N/A'}`);
        console.log(`   Édition: ${card.edition || 'N/A'}`);
        if (card.power && card.toughness) {
          console.log(`   P/T: ${card.power}/${card.toughness}`);
        }
        console.log('');
      });
      
      if (cards.length > 5) {
        console.log(`... et ${cards.length - 5} autres cartes\n`);
      }
      
      console.log('✅ Test réussi ! Le scraping fonctionne correctement.\n');
    } else {
      console.log('⚠️  Aucune carte extraite. Vérifiez la structure HTML.\n');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

const pageNumber = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
testScraping(pageNumber);

