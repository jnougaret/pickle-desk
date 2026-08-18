import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const configPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const requiredFiles = [
  'dist/index.html',
  'src-tauri/Cargo.toml',
  'src-tauri/src/lib.rs',
  'src-tauri/migrations/0001_create_tournaments.sql',
  'src-tauri/icons/32x32.png',
  'src-tauri/icons/128x128.png',
  'src-tauri/icons/128x128@2x.png',
  'src-tauri/icons/icon.icns',
  'src-tauri/icons/icon.ico'
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Tauri packaging smoke check failed; missing: ${missing.join(', ')}`);
  process.exit(1);
}

if (config.build?.frontendDist !== '../dist') throw new Error('Tauri frontendDist must point at the Vite dist directory.');
if (!config.bundle?.targets?.includes('dmg') || !config.bundle?.targets?.includes('nsis')) {
  throw new Error('Tauri bundle targets must include dmg and nsis.');
}
if (!config.plugins?.sql?.preload?.includes('sqlite:tournament-desk.db')) {
  throw new Error('SQLite database must be preloaded for migration checks.');
}
if (config.bundle?.windows?.webviewInstallMode?.type !== 'offlineInstaller') {
  throw new Error('Windows installer must embed the offline WebView2 installer.');
}

const css = fs.readFileSync(path.join(root, 'src/app.css'), 'utf8');
if (/https?:\/\//.test(css)) throw new Error('Runtime CSS contains an external URL and is not offline-safe.');

console.log('Tauri packaging smoke check passed: frontend, icons, migrations, targets, and offline CSS are present.');
