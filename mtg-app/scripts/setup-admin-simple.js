#!/usr/bin/env node

/**
 * Ce script ne fait plus partie du projet.
 * L'authentification et les rôles admin sont gérés par PocketBase.
 *
 * Pour créer un administrateur :
 * 1. Créez un utilisateur via l'interface PocketBase (Admin UI ou inscription)
 * 2. Dans PocketBase Admin > Collections > users (ou la collection des rôles),
 *    définissez le rôle admin pour cet utilisateur selon votre schéma (ex. champ "roles" en JSON)
 *
 * Voir la documentation PocketBase et PROTOCOLE_ADMIN.md pour les détails.
 */

console.log('L\'application utilise désormais PocketBase pour l\'authentification.');
console.log('Les administrateurs se gèrent depuis l\'interface d\'administration PocketBase.');
console.log('Voir PROTOCOLE_ADMIN.md pour les instructions à jour.\n');
process.exit(0);
