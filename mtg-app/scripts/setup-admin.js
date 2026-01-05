#!/usr/bin/env node

/**
 * Script pour créer le premier administrateur
 * 
 * Ce script utilise Firebase Admin SDK pour créer un utilisateur et définir son rôle admin
 * 
 * Prérequis:
 * 1. Installer firebase-admin: npm install firebase-admin
 * 2. Télécharger le fichier de credentials de service depuis Firebase Console
 *    Project Settings > Service Accounts > Generate new private key
 * 3. Placer le fichier JSON dans le projet (ex: serviceAccountKey.json)
 * 
 * Usage:
 * node scripts/setup-admin.js
 * 
 * Ou avec les variables d'environnement:
 * FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json node scripts/setup-admin.js
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fonction pour lire l'input de l'utilisateur
function askQuestion(query) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Fonction pour lire le mot de passe de manière sécurisée
function askPassword(query) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
    // Masquer le mot de passe (ne fonctionne pas sur tous les terminaux)
    process.stdout.write('\x1B[8m');
  });
}

async function main() {
  try {
    console.log('=== Configuration du premier administrateur ===\n');

    // Vérifier si Firebase Admin est déjà initialisé
    let app;
    if (getApps().length === 0) {
      // Chemin vers le fichier de credentials de service
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
        join(__dirname, '..', 'serviceAccountKey.json');

      let serviceAccount;
      try {
        const serviceAccountFile = readFileSync(serviceAccountPath, 'utf8');
        serviceAccount = JSON.parse(serviceAccountFile);
      } catch (error) {
        console.error('❌ Erreur: Impossible de lire le fichier de credentials de service.');
        console.error(`   Chemin attendu: ${serviceAccountPath}`);
        console.error('\n📝 Instructions:');
        console.error('   1. Allez dans Firebase Console > Project Settings > Service Accounts');
        console.error('   2. Cliquez sur "Generate new private key"');
        console.error('   3. Téléchargez le fichier JSON');
        console.error('   4. Placez-le dans le projet et renommez-le "serviceAccountKey.json"');
        console.error('   5. Ou définissez la variable d\'environnement FIREBASE_SERVICE_ACCOUNT_PATH');
        process.exit(1);
      }

      // Initialiser Firebase Admin
      app = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialisé\n');
    } else {
      app = getApps()[0];
    }

    const auth = getAuth(app);
    const db = getFirestore(app);

    // Demander les informations de l'admin
    console.log('Veuillez entrer les informations pour le premier administrateur:\n');
    
    const email = await askQuestion('Email: ');
    if (!email || !email.includes('@')) {
      console.error('❌ Email invalide');
      process.exit(1);
    }

    const password = await askPassword('Mot de passe (min. 6 caractères): ');
    if (!password || password.length < 6) {
      console.error('❌ Le mot de passe doit contenir au moins 6 caractères');
      process.exit(1);
    }

    const confirmPassword = await askPassword('Confirmer le mot de passe: ');
    if (password !== confirmPassword) {
      console.error('❌ Les mots de passe ne correspondent pas');
      process.exit(1);
    }

    const pseudonym = await askQuestion('Pseudonyme (optionnel, laissez vide pour utiliser l\'email): ') || email.split('@')[0];

    console.log('\n⏳ Création de l\'utilisateur...\n');

    // Vérifier si l'utilisateur existe déjà
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log('⚠️  L\'utilisateur existe déjà dans Firebase Auth');
      console.log(`   UID: ${userRecord.uid}\n`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Créer l'utilisateur
        userRecord = await auth.createUser({
          email,
          password,
          emailVerified: true,
        });
        console.log('✅ Utilisateur créé dans Firebase Auth');
        console.log(`   UID: ${userRecord.uid}\n`);
      } else {
        throw error;
      }
    }

    // Créer ou mettre à jour le profil dans Firestore
    const profileRef = db.collection('users').doc(userRecord.uid).collection('profile').doc('data');
    const profileSnap = await profileRef.get();

    const profileData = {
      uid: userRecord.uid,
      email: userRecord.email,
      role: 'admin',
      pseudonym: pseudonym,
      avatarId: 'default',
      createdAt: profileSnap.exists ? profileSnap.data().createdAt : Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await profileRef.set(profileData);

    if (profileSnap.exists) {
      console.log('✅ Profil mis à jour dans Firestore');
      console.log('   Rôle défini: admin\n');
    } else {
      console.log('✅ Profil créé dans Firestore');
      console.log('   Rôle défini: admin\n');
    }

    console.log('🎉 Configuration terminée avec succès!\n');
    console.log('📋 Résumé:');
    console.log(`   Email: ${email}`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Rôle: admin`);
    console.log(`   Pseudonyme: ${pseudonym}\n`);
    console.log('✅ Vous pouvez maintenant vous connecter à l\'application avec ces identifiants.');
    console.log('   Le lien "Admin" devrait apparaître dans la barre de navigation.\n');

  } catch (error) {
    console.error('\n❌ Erreur lors de la configuration:', error.message);
    if (error.code) {
      console.error(`   Code d'erreur: ${error.code}`);
    }
    process.exit(1);
  }
}

main();


