import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Must be the IPv4 literal, not `localhost`: on Windows Node resolves
      // `localhost` to `::1` first, while the API binds 0.0.0.0 (IPv4 only).
      // The proxy then races a refused IPv6 connection and can return an empty
      // body, which surfaced as "Unexpected end of JSON input" in the browser.
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    }
  }
});

