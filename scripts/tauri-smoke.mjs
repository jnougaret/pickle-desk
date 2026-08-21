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
if (config.bundle?.windows?.nsis?.installerIcon !== 'icons/icon.ico' || config.bundle?.windows?.nsis?.uninstallerIcon !== 'icons/icon.ico') {
  throw new Error('Windows NSIS installer and uninstaller must use the Pickle Desk icon.');
}

const msixManifest = fs.readFileSync(path.join(root, 'packaging', 'msix', 'AppxManifest.xml'), 'utf8');
const requiredMsixManifestValues = [
  'ProcessorArchitecture="x64"',
  'Name="Windows.Desktop"',
  'MinVersion="10.0.19041.0"',
  'MaxVersionTested="10.0.26100.0"',
  'uap10:RuntimeBehavior="packagedClassicApp"',
  'uap10:TrustLevel="mediumIL"',
  '<rescap:Capability Name="runFullTrust" />'
];
const missingMsixManifestValues = requiredMsixManifestValues.filter((value) => !msixManifest.includes(value));
if (missingMsixManifestValues.length) {
  throw new Error(`MSIX manifest smoke check failed; missing: ${missingMsixManifestValues.join(', ')}`);
}

const css = fs.readFileSync(path.join(root, 'src/app.css'), 'utf8');
if (/https?:\/\//.test(css)) throw new Error('Runtime CSS contains an external URL and is not offline-safe.');

console.log('Tauri packaging smoke check passed: frontend, icons, migrations, targets, MSIX manifest, and offline CSS are present.');
