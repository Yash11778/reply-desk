import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers';

// Gemma runs here, off the UI thread. Nothing in this file talks to any server
// except Hugging Face's CDN, once, to download the open weights.

const MODEL = 'onnx-community/gemma-3-1b-it-ONNX';

export type WorkerIn =
  | { type: 'load'; webgpu: boolean }
  | { type: 'ask'; id: number; prompt: string; maxTokens: number };

export type WorkerOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: string }
  | { type: 'answer'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };

let gen: TextGenerationPipeline | null = null;
const post = (m: WorkerOut) => self.postMessage(m);

// Bytes per file, so the bar reflects the whole download rather than jumping per file.
const files = new Map<string, { loaded: number; total: number }>();

async function load(webgpu: boolean) {
  const device = webgpu ? 'webgpu' : 'wasm';
  gen = (await pipeline('text-generation', MODEL, {
    device,
    // q4f16 needs WebGPU's fp16. The 4-bit builds also use GatherBlockQuantized,
    // which onnxruntime-web's WASM backend doesn't implement, so the CPU path runs int8.
    dtype: webgpu ? 'q4f16' : 'int8',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: 'progress', loaded, total });
    },
  })) as TextGenerationPipeline;
  post({ type: 'ready', device });
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      if (!gen) await load(msg.webgpu);
      else post({ type: 'ready', device: 'cached' });
      return;
    }
    if (!gen) throw new Error('Model not loaded');
    const out = (await gen([{ role: 'user', content: msg.prompt }], {
      max_new_tokens: msg.maxTokens,
      do_sample: false,
    })) as unknown as { generated_text: { content: string }[] }[];
    post({ type: 'answer', id: msg.id, text: out[0].generated_text.at(-1)?.content ?? '' });
  } catch (err) {
    post({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
