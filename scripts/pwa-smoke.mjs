import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const dist = path.join(root, 'dist');

function normalizeBasePath(value) {
  const trimmed = value.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

const basePath = normalizeBasePath(process.env.BASE_PATH || '/');

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
if (manifest.display !== 'standalone' || manifest.start_url !== basePath || manifest.scope !== basePath) {
  throw new Error(`Manifest must be standalone and rooted at ${basePath}.`);
}
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error('Manifest is missing install icons.');
if (!manifest.icons.every((icon) => icon.src.startsWith(basePath))) throw new Error('Manifest icons must use the configured base path.');
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

const headers = read('_headers');
if (!headers.includes('/sw.js') || !/Cache-Control:\s*no-cache/.test(headers)) {
  throw new Error('Cloudflare Pages headers must revalidate the service worker script.');
}

const serviceWorker = read('sw.js');
const match = serviceWorker.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('Service worker precache list is missing.');
const urls = JSON.parse(match[1]);
if (!urls.includes(`${basePath}index.html`) || !urls.includes(`${basePath}manifest.webmanifest`)) {
  throw new Error('Service worker must precache the app shell and manifest.');
}
if (urls.some((url) => url.endsWith('/_headers') || url.endsWith('/_redirects'))) {
  throw new Error('Cloudflare Pages control files must not be precached.');
}
for (const url of urls) {
  if (!url.startsWith(basePath) || !fs.existsSync(path.join(dist, url.slice(basePath.length)))) {
    throw new Error(`Precached file is missing: ${url}`);
  }
}
for (const required of ['CACHE_NAME = \'pickle-desk-', 'LEGACY_CACHE_PREFIX', 'network-first', 'caches.match(request)', 'caches.match(INDEX_URL)']) {
  if (!serviceWorker.includes(required)) throw new Error(`Service worker behavior is missing ${required}.`);
}
for (const required of ['const EMBEDDED_ASSETS =', 'function embeddedResponse(url)', 'function offlineAppShell()', 'embeddedResponse(request.url)', '.catch(() => undefined)']) {
  if (!serviceWorker.includes(required)) throw new Error(`Service worker embedded offline fallback is missing ${required}.`);
}
for (const url of urls) {
  if (!serviceWorker.includes(JSON.stringify(url))) {
    throw new Error(`Embedded offline assets are missing: ${url}`);
  }
}

async function assertCacheIndependentFallback() {
  const listeners = new Map();
  const origin = 'https://pwa-smoke.example';
  const unavailableCaches = {
    open: async () => { throw new Error('Cache Storage unavailable'); },
    match: async () => { throw new Error('Cache Storage unavailable'); },
    keys: async () => { throw new Error('Cache Storage unavailable'); }
  };
  const scope = vm.createContext({
    URL,
    Uint8Array,
    Response,
    atob,
    caches: unavailableCaches,
    fetch: async () => { throw new Error('Network unavailable'); },
    console,
    self: {
      location: new URL(`${origin}${basePath}`),
      addEventListener: (type, handler) => listeners.set(type, handler),
      skipWaiting: async () => {},
      clients: { claim: async () => {} }
    }
  });
  vm.runInContext(serviceWorker, scope, { filename: 'dist/sw.js' });
  const fetchHandler = listeners.get('fetch');
  if (!fetchHandler) throw new Error('Service worker fetch handler was not registered.');

  async function respond(request) {
    let responsePromise;
    fetchHandler({
      request,
      respondWith: (value) => { responsePromise = Promise.resolve(value); }
    });
    return responsePromise;
  }

  const navigation = await respond({ method: 'GET', mode: 'navigate', url: `${origin}${basePath}` });
  if (!navigation || navigation.status !== 200 || !(await navigation.text()).includes('<div id="app"></div>')) {
    throw new Error('Cache-independent offline navigation did not return the app shell.');
  }

  const scriptUrl = urls.find((url) => url.endsWith('.js'));
  const script = await respond({ method: 'GET', mode: 'same-origin', url: `${origin}${scriptUrl}` });
  if (!script || script.status !== 200 || !(await script.text()).includes('Pickle Desk')) {
    throw new Error('Cache-independent offline asset fallback did not return the app script.');
  }
}

await assertCacheIndependentFallback();

console.log(`PWA smoke check passed: standalone manifest, 192/512 icons, ${urls.length} precached files, and executable cache-independent offline fallback.`);
