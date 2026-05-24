import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Peabloom/',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'splash-logo.png'],
      manifest: {
        name: 'PeaBloom',
        short_name: 'PeaBloom',
        description: 'Suivi ETF & PEA — DCA tracker',
        theme_color: '#13111A',
        background_color: '#13111A',
        display: 'standalone',
        start_url: '/Peabloom/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
