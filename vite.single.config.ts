import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Genera un único archivo HTML (dist-single/TerraStruct.html) que funciona sin conexión.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-single', chunkSizeWarningLimit: 8000, assetsInlineLimit: 100000000 },
});
