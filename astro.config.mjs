import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://never-nude.github.io',
  base: '/rear-view',
  output: 'static',
  trailingSlash: 'always',
  server: { host: '127.0.0.1', port: 4321 },
  vite: { build: { chunkSizeWarningLimit: 1100 } },
});
