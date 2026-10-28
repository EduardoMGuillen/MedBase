import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { appendDictation, downloadPercent, modelFor, recordingClock } from '../src/lib/dictation.js'

describe('dictado de voz', () => {
  test('el texto dictado se agrega al final de lo escrito, con un espacio y sin espacios sobrantes', () => {
    assert.equal(appendDictation('', ' Paciente estable.'), 'Paciente estable.')
    assert.equal(appendDictation('Afebril.', ' Tolera la vía oral. '), 'Afebril. Tolera la vía oral.')
    assert.equal(appendDictation('Afebril.\n', 'Tolera la vía oral.'), 'Afebril.\nTolera la vía oral.')
    assert.equal(appendDictation('Afebril.', '   '), 'Afebril.')
  })

  test('con aceleración gráfica y media precisión usa la tarjeta; si no, el mismo modelo comprimido en el procesador', () => {
    assert.deepEqual(modelFor({ webgpu: true, f16: true }), {
      model: 'onnx-community/whisper-small', device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' },
    })
    // whisper-base es 3 veces más rápido en el procesador, pero en las pruebas se comía frases y confundía términos
    assert.deepEqual(modelFor({ webgpu: true, f16: false }), { model: 'onnx-community/whisper-small', device: 'wasm', dtype: 'q8' })
    assert.deepEqual(modelFor({ webgpu: false, f16: false }), { model: 'onnx-community/whisper-small', device: 'wasm', dtype: 'q8' })
  })

  test('el progreso de la descarga suma todos los archivos del modelo', () => {
    assert.equal(downloadPercent({}), 0)
    assert.equal(downloadPercent({ a: { loaded: 50, total: 100 }, b: { loaded: 0, total: 300 } }), 13)
    assert.equal(downloadPercent({ a: { loaded: 100, total: 100 }, b: { loaded: 300, total: 300 } }), 100)
  })

  test('el reloj de la grabación muestra minutos y segundos', () => {
    assert.equal(recordingClock(0), '0:00')
    assert.equal(recordingClock(9), '0:09')
    assert.equal(recordingClock(75), '1:15')
  })
})
