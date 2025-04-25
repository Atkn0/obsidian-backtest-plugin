import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: './src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js'
    }
  }
});
