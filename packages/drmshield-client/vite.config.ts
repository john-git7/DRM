import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DRMShieldClient',
      formats: ['es', 'umd'],
      fileName: (format) =>
        format === 'es' ? 'drmshield-client.js' : 'drmshield-client.umd.cjs',
    },
    rollupOptions: {
      external: ['hls.js'],
      output: {
        globals: { 'hls.js': 'Hls' },
      },
    },
  },
});
