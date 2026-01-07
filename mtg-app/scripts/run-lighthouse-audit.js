import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const reportsDir = join(process.cwd(), 'lighthouse-reports');

// Créer le dossier des rapports si nécessaire
if (!existsSync(reportsDir)) {
  execSync(`mkdir ${reportsDir}`, { stdio: 'inherit' });
}

console.log('🔨 Building application...');
execSync('npm run build', { stdio: 'inherit' });

console.log('🚀 Starting preview server...');
const previewProcess = execSync('npm run preview', { 
  stdio: 'pipe',
  detached: true,
  shell: true
});

// Attendre que le serveur soit prêt
console.log('⏳ Waiting for server to start...');
await new Promise(resolve => setTimeout(resolve, 5000));

const pages = [
  { path: '/', name: 'home' },
  { path: '/collection', name: 'collection' },
  { path: '/statistics', name: 'statistics' },
  { path: '/decks', name: 'decks' }
];

console.log('📊 Running Lighthouse audits...');

for (const page of pages) {
  console.log(`\n🔍 Auditing ${page.name}...`);
  try {
    execSync(
      `npx lighthouse http://localhost:4173${page.path} ` +
      `--output=html --output-path=./lighthouse-reports/${page.name}.html ` +
      `--view=false --chrome-flags="--headless" ` +
      `--only-categories=performance,accessibility,best-practices,seo`,
      { stdio: 'inherit' }
    );
    console.log(`✅ ${page.name} audit completed`);
  } catch (error) {
    console.error(`❌ Error auditing ${page.name}:`, error.message);
  }
}

console.log('\n✨ All audits completed!');
console.log(`📁 Reports saved in: ${reportsDir}`);

