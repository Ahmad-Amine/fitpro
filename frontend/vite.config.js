import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } },
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://testflex.cybersource.com https://*.cybersource.com; " +
        "frame-src https://testflex.cybersource.com https://*.cybersource.com; " +
        "connect-src 'self' http://localhost:5000 https://testflex.cybersource.com https://*.cybersource.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:;"
    }
  }
})
