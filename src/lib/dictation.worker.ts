/// <reference lib="webworker" />
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { downloadPercent, modelFor, type ModelChoice } from './dictationModel'

// El modelo viene de Hugging Face y queda en la caché del navegador; nunca de nuestro servidor
env.allowLocalModels = false
env.useBrowserCache = true

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null
const files: Record<string, { loaded: number; total: number }> = {}

function create(choice: ModelChoice) {
  return pipeline('automatic-speech-recognition', choice.model, {
    device: choice.device,
    dtype: choice.dtype as never,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return
      files[p.file] = { loaded: p.loaded ?? 0, total: p.total }
      postMessage({ type: 'progress', pct: downloadPercent(files) })
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>
}

async function load() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu
  const adapter = await gpu?.requestAdapter().catch(() => null)
  const choice = modelFor({ webgpu: !!adapter, f16: !!adapter?.features.has('shader-f16') })
  try {
    return await create(choice)
  } catch (e) {
    // Si la tarjeta gráfica falla, el modelo comprimido en el procesador siempre funciona
    if (choice.device !== 'webgpu') throw e
    for (const k of Object.keys(files)) delete files[k]
    return create(modelFor({ webgpu: false, f16: false }))
  }
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  if (m.type === 'load') {
    try {
      asr ??= load()
      await asr
      postMessage({ type: 'ready' })
    } catch (err) {
      asr = null
      postMessage({ type: 'error', message: `No se pudo cargar el dictado: ${(err as Error).message}` })
    }
  } else if (m.type === 'transcribe') {
    try {
      const out = await (await asr!)(m.audio, { language: 'spanish', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
      postMessage({ type: 'result', id: m.id, text: (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text) ?? '' })
    } catch (err) {
      postMessage({ type: 'error', id: m.id, message: `No se pudo transcribir: ${(err as Error).message}` })
    }
  }
}
