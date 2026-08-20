import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const base = process.env.BASE_PATH || '/';

export default defineConfig({
  plugins: [svelte()],
  base,
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
