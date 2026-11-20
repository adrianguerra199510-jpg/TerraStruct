import { defineConfig, Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Servidor MCP en un único archivo (release/terrastruct-mcp.mjs) que solo necesita Node 18+ (o el propio TerraStruct.exe).
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function resvgWasm(): Plugin {
  const id = 'virtual:resvg-wasm';
  return {
    name: 'resvg-wasm-inline',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load: (s) => (s === '\0' + id ? `export default ${JSON.stringify(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')).toString('base64'))};` : null),
  };
}

export default defineConfig({
  plugins: [resvgWasm()],
  publicDir: false,
  define: { __TS_VERSION__: JSON.stringify(pkg.version) },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'mcp/server.ts',
    outDir: 'release',
    emptyOutDir: false,
    target: 'node18',
    minify: false,
    sourcemap: false,
    rollupOptions: { output: {
        format: 'es',
        // algunas dependencias CommonJS (pdfkit) usan require, __filename y __dirname
        banner: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path';\nconst require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);", entryFileNames: 'terrastruct-mcp.mjs', inlineDynamicImports: true } },
  },
});
