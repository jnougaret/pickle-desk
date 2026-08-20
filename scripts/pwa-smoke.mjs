import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

function read(relativePath) {
  return fs.readFileSync(path.join(dist, relativePath), 'utf8');
}

function pngSize(relativePath) {
  const bytes = fs.readFileSync(path.join(dist, relativePath));
  if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error(`${relativePath} is not a PNG.`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const manifest = JSON.parse(read('manifest.webmanifest'));
if (manifest.display !== 'standalone' || manifest.start_url !== '/' || manifest.scope !== '/') {
  throw new Error('Manifest must be standalone and rooted at /.');
}
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error('Manifest is missing install icons.');
if (pngSize('icons/icon-192.png').width !== 192 || pngSize('icons/icon-192.png').height !== 192) {
  throw new Error('The 192px PWA icon has the wrong dimensions.');
}
if (pngSize('icons/icon-512.png').width !== 512 || pngSize('icons/icon-512.png').height !== 512) {
  throw new Error('The 512px PWA icon has the wrong dimensions.');
}

const html = read('index.html');
for (const required of ['manifest.webmanifest', 'apple-touch-icon.png', 'mobile-web-app-capable', 'apple-mobile-web-app-capable']) {
  if (!html.includes(required)) throw new Error(`index.html is missing ${required}.`);
}

const serviceWorker = read('sw.js');
const match = serviceWorker.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('Service worker precache list is missing.');
const urls = JSON.parse(match[1]);
if (!urls.includes('/index.html') || !urls.includes('/manifest.webmanifest')) {
  throw new Error('Service worker must precache the app shell and manifest.');
}
for (const url of urls) {
  if (!fs.existsSync(path.join(dist, url.slice(1)))) throw new Error(`Precached file is missing: ${url}`);
}
for (const required of ['network-first', 'caches.match(request)', 'caches.match(\'/index.html\')']) {
  if (!serviceWorker.includes(required)) throw new Error(`Service worker behavior is missing ${required}.`);
}

console.log(`PWA smoke check passed: standalone manifest, 192/512 icons, ${urls.length} precached files, and offline navigation fallback.`);
