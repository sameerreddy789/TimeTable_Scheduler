import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // prompt so we can show the update banner
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Smart Timetable',
        short_name: 'Timetable',
        theme_color: '#1a73e8',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Cache current-week timetable JSON with network-first strategy (task 11.1)
        runtimeCaching: [
          {
            urlPattern: /\/api\/timetable\?.*week=current/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'timetable-current-week',
              expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/timetable\/version-hash/,
            handler: 'NetworkOnly', // always check version hash live
          },
          {
            urlPattern: /\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
