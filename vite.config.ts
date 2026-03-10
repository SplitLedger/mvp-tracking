import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

const manifest = {
    name: 'Pre-renewal RO MVP Tracking',
    short_name: 'MVP Tracker',
    description: 'Track MVP respawn timers for Pre-renewal Ragnarok Online',
    start_url: '/mvp-tracking/',
    scope: '/mvp-tracking/',
    background_color: '#000000',
    theme_color: '#ffca16',
    icons: [
        {
            src: '/192x192.png',
            sizes: '192x192',
            type: 'image/png',
        },
        {
            src: '/512x512.png',
            sizes: '512x512',
            type: 'image/png',
        },
        {
            src: '/512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
        },
    ],
}

// https://vite.dev/config/
export default defineConfig({
    base: '/mvp-tracking/',
    plugins: [
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        VitePWA({
            manifest,
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['mvps/*.png'],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
})
