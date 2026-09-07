import fs from 'fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const isDebugBuild = process.env.VITE_DEBUG_BUILD === 'true';

const appVersion = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
).version as string;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    {
      name: 'spa-fallback-404',
      closeBundle() {
        const index = path.resolve('dist/index.html');
        if (fs.existsSync(index)) {
          fs.copyFileSync(index, path.resolve('dist/404.html'));
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Readable bundles + source maps for debugging; set VITE_DEBUG_BUILD=false for release builds.
    minify: isDebugBuild ? false : 'esbuild',
    sourcemap: isDebugBuild,
  },
  esbuild: {
    keepNames: isDebugBuild,
  },
});
