import { defineConfig } from 'vite';

// Cross-origin isolation unlocks SharedArrayBuffer, which onnxruntime-web needs to
// run the CPU path on every core instead of one. "credentialless" keeps the
// Hugging Face CDN downloads working without it sending CORP headers.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
});
