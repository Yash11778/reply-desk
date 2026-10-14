import type { WorkerIn, WorkerOut } from './worker';

let worker: Worker | null = null;
let ready: Promise<string> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }>();

/** A browser can expose `navigator.gpu` with no usable adapter, so actually ask for one. */
export async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

export function loadModel(onProgress: (fraction: number, mb: number) => void): Promise<string> {
  if (ready) return ready;
  ready = (async () => {
    const webgpu = await hasWebGPU();
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return new Promise<string>((resolve, reject) => {
      worker!.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.total ? m.loaded / m.total : 0, m.total / 1e6);
        else if (m.type === 'ready') resolve(webgpu ? 'WebGPU' : 'CPU');
        else if (m.type === 'answer') pending.get(m.id)?.resolve(m.text), pending.delete(m.id);
        else if (m.type === 'error') {
          if (m.id != null) pending.get(m.id)?.reject(new Error(m.message)), pending.delete(m.id);
          else reject(new Error(m.message));
        }
      };
      worker!.postMessage({ type: 'load', webgpu } satisfies WorkerIn);
    });
  })();
  ready.catch(() => (ready = null));
  return ready;
}

export function ask(prompt: string, maxTokens: number): Promise<string> {
  if (!worker) return Promise.reject(new Error('Model not loaded'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ type: 'ask', id, prompt, maxTokens } satisfies WorkerIn);
  });
}
