/** Qué modelo de Whisper usar y cómo medir su descarga. Lo usan la app y el worker del dictado. */

export interface ModelChoice { model: string; device: 'webgpu' | 'wasm'; dtype: 'q8' | Record<string, string> }

/**
 * whisper-small: con WebGPU y media precisión corre en la tarjeta (unos 390 MB, rápido); si no, cuantizado en el
 * procesador (unos 240 MB, más lento). whisper-base sería más rápido en el procesador pero se come frases.
 */
export function modelFor(gpu: { webgpu: boolean; f16: boolean }): ModelChoice {
  if (gpu.webgpu && gpu.f16) return { model: 'onnx-community/whisper-small', device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' } }
  return { model: 'onnx-community/whisper-small', device: 'wasm', dtype: 'q8' }
}

/** Porcentaje descargado del modelo, sumando todos sus archivos. */
export function downloadPercent(files: Record<string, { loaded: number; total: number }>) {
  const all = Object.values(files)
  const total = all.reduce((s, f) => s + f.total, 0)
  return total ? Math.round(all.reduce((s, f) => s + f.loaded, 0) / total * 100) : 0
}
