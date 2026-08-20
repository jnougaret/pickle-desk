import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

mount(App, { target: document.getElementById('app')! });

if (import.meta.env.PROD && typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window) && /^https?:$/.test(window.location.protocol) && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      // Offline operation remains available without a service worker; do not
      // surface registration noise to tournament operators.
    });
  }, { once: true });
}
