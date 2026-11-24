import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';

export default defineConfig({
  plugins: [
    stylex.vite({
      // Keep generated styles in the same cascade as the global and state rules.
      useCSSLayers: false,
      dev: process.env.NODE_ENV !== 'production',
      runtimeInjection: false,
    }),
    react(),
  ],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:4179', '/events': 'http://127.0.0.1:4179' },
  },
});
