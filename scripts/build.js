#!/usr/bin/env node
/**
 * Assemble le fichier HTML final autonome depuis les sources séparées.
 *
 * Usage :
 *   node scripts/build.js alex       -> dist/index_alex.html
 *   node scripts/build.js charlotte  -> dist/index_charlotte.html
 *   node scripts/build.js            -> construit les deux
 *
 * Le fichier produit est autonome : données, bibliothèque MSAL et code applicatif
 * sont tous intégrés. C'est ce fichier (renommé index.html) qu'on dépose sur GitHub Pages.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');

const PROFILES = {
  alex: {
    data: 'budget_data_alex.json',
    title: 'Budget Alex — Suivi personnel',
    brand: 'Budget <em>Alex</em>',
    out: 'index_alex.html',
  },
  charlotte: {
    data: 'budget_data_charlotte.json',
    title: 'Budget Charlotte — Suivi personnel',
    brand: 'Budget <em>Charlotte</em>',
    out: 'index_charlotte.html',
  },
};

function build(profileName) {
  const p = PROFILES[profileName];
  if (!p) { console.error('Profil inconnu:', profileName); process.exit(1); }

  let shell = fs.readFileSync(path.join(SRC, 'app_shell.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
  const msal = fs.readFileSync(path.join(SRC, 'msal-browser.min.js'), 'utf8');
  const seed = fs.readFileSync(path.join(DATA, p.data), 'utf8');

  // Personnalisation (titre + marque) — le shell source contient les valeurs "Alex" par défaut
  shell = shell
    .replace('Budget Alex — Suivi personnel', p.title)
    .replace('Budget <em>Alex</em>', p.brand);

  // Injection des placeholders
  for (const ph of ['__MSAL_JS__', '__SEED_DATA__', '__APP_JS__']) {
    if (!shell.includes(ph)) { console.error('Placeholder manquant:', ph); process.exit(1); }
  }
  const out = shell
    .replace('__MSAL_JS__', () => msal)
    .replace('__SEED_DATA__', () => seed)
    .replace('__APP_JS__', () => appjs);

  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
  const outPath = path.join(DIST, p.out);
  fs.writeFileSync(outPath, out);
  console.log(`✓ ${p.out} (${(out.length / 1024).toFixed(0)} Ko)`);
}

const arg = process.argv[2];
if (arg) build(arg);
else Object.keys(PROFILES).forEach(build);
