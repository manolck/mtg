#!/usr/bin/env node

/**
 * Script simplifié pour créer le premier administrateur
 * 
 * Cette version utilise l'API REST Firebase Identity Toolkit
 * Aucune dépendance supplémentaire requise (utilise seulement les modules Node.js natifs)
 * 
 * Prérequis:
 * 1. Avoir un fichier .env.local avec VITE_FIREBASE_API_KEY
 * 2. Ou définir la variable d'environnement FIREBASE_API_KEY
 * 
 * Usage:
 * node scripts/setup-admin-simple.js
 * 
 * Ou avec la variable d'environnement:
 * FIREBASE_API_KEY=your-api-key node scripts/setup-admin-simple.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement depuis .env.local
function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    const envFile = readFileSync(envPath, 'utf8');
    const env = {};
    
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        env[key] = value;
      }
    });
    
    return env;
  } catch (error) {
    return {};
  }
}

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

async function main() {
  try {
    console.log('=== Configuration du premier administrateur (Version Simple) ===\n');

    // Charger la configuration Firebase
    const env = loadEnv();
    const apiKey = process.env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY;
    const authDomain = process.env.FIREBASE_AUTH_DOMAIN || env.VITE_FIREBASE_AUTH_DOMAIN;
    const projectId = process.env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;

    if (!apiKey) {
      console.error('❌ Erreur: Clé API Firebase non trouvée.');
      console.error('\n📝 Solutions:');
      console.error('   1. Créez un fichier .env.local avec VITE_FIREBASE_API_KEY=...');
      console.error('   2. Ou définissez la variable d\'environnement FIREBASE_API_KEY');
      console.error('   3. La clé API se trouve dans Firebase Console > Project Settings > General');
      process.exit(1);
    }

    // Initialiser Firebase (version client)
    const firebaseConfig = {
      apiKey,
      authDomain: authDomain || `${projectId}.firebaseapp.com`,
      projectId: projectId || 'dummy',
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    console.log('✅ Configuration Firebase chargée\n');

    // Demander les informations de l'admin
    console.log('Veuillez entrer les informations pour le premier administrateur:\n');
    
    const email = await askQuestion('Email: ');
    if (!email || !email.includes('@')) {
      console.error('❌ Email invalide');
      process.exit(1);
    }

    const password = await askQuestion('Mot de passe (min. 6 caractères): ');
    if (!password || password.length < 6) {
      console.error('❌ Le mot de passe doit contenir au moins 6 caractères');
      process.exit(1);
    }

    const confirmPassword = await askQuestion('Confirmer le mot de passe: ');
    if (password !== confirmPassword) {
      console.error('❌ Les mots de passe ne correspondent pas');
      process.exit(1);
    }

    const pseudonym = await askQuestion('Pseudonyme (optionnel, laissez vide pour utiliser l\'email): ') || email.split('@')[0];

    console.log('\n⏳ Création de l\'utilisateur...\n');

    // Créer l'utilisateur via l'API REST Firebase Identity Toolkit
    try {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.message?.includes('EMAIL_EXISTS')) {
          console.log('⚠️  L\'utilisateur existe déjà dans Firebase Auth');
          console.log('   Vous devrez définir manuellement le rôle admin dans Firestore\n');
          console.log('📝 Instructions:');
          console.log('   1. Allez dans Firebase Console > Firestore Database');
          console.log('   2. Créez le document: users/{userId}/profile/data');
          console.log('   3. Ajoutez le champ role: "admin"');
          console.log(`   4. L'UID de l'utilisateur est visible dans Authentication > Users pour l'email: ${email}`);
          process.exit(0);
        }
        throw new Error(data.error?.message || 'Failed to create user');
      }

      const uid = data.localId;
      console.log('✅ Utilisateur créé dans Firebase Auth');
      console.log(`   UID: ${uid}\n`);

      // Créer le profil dans Firestore
      const profileRef = doc(db, 'users', uid, 'profile', 'data');
      const profileData = {
        uid,
        email,
        role: 'admin',
        pseudonym,
        avatarId: 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await setDoc(profileRef, profileData);
      console.log('✅ Profil créé dans Firestore');
      console.log('   Rôle défini: admin\n');

      console.log('🎉 Configuration terminée avec succès!\n');
      console.log('📋 Résumé:');
      console.log(`   Email: ${email}`);
      console.log(`   UID: ${uid}`);
      console.log(`   Rôle: admin`);
      console.log(`   Pseudonyme: ${pseudonym}\n`);
      console.log('✅ Vous pouvez maintenant vous connecter à l\'application avec ces identifiants.');
      console.log('   Le lien "Admin" devrait apparaître dans la barre de navigation.\n');

    } catch (error) {
      console.error('\n❌ Erreur lors de la configuration:', error.message);
      if (error.code) {
        console.error(`   Code d'erreur: ${error.code}`);
      }
      console.error('\n💡 Alternative: Utilisez la Méthode 1 (Firebase Console) décrite dans PROTOCOLE_ADMIN.md');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    process.exit(1);
  }
}

main();


