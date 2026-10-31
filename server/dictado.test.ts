import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { browserEngine, DICTATION_LANGS, DICTATION_MESSAGE, dictationError, insertDictation, unsupportedMessage } from '../src/lib/dictation.js'

describe('dictado de voz (MC4, ronda 5)', () => {
  test('lo dictado va en el lugar del cursor, sin borrar lo escrito y con los espacios justos', () => {
    assert.deepEqual(insertDictation('', ' paciente estable.'), { value: 'Paciente estable.', end: 17 })
    assert.equal(insertDictation('Afebril.', ' Tolera la vía oral. ').value, 'Afebril. Tolera la vía oral.')
    assert.equal(insertDictation('Afebril.\n', 'Tolera la vía oral.').value, 'Afebril.\nTolera la vía oral.')
    assert.equal(insertDictation('Afebril.', '   ').value, 'Afebril.')
    // En medio del texto: con el cursor después de «Afebril.»
    const r = insertDictation('Afebril. Abdomen blando.', 'tolera la vía oral.', 8)
    assert.equal(r.value, 'Afebril. tolera la vía oral. Abdomen blando.')
    // El siguiente pedazo va después del anterior
    assert.equal(insertDictation(r.value, 'sin náuseas.', r.end).value, 'Afebril. tolera la vía oral. sin náuseas. Abdomen blando.')
  })

  test('español de Honduras primero y, si el navegador no lo tiene, otras variantes de español', () => {
    assert.equal(DICTATION_LANGS[0], 'es-HN')
    assert.ok(DICTATION_LANGS.every((l) => l.startsWith('es-')))
  })

  test('cada falla tiene un mensaje en español; ninguna es silenciosa', () => {
    assert.equal(dictationError('not-allowed'), 'denied')
    assert.equal(dictationError('service-not-allowed'), 'denied')
    assert.equal(dictationError('audio-capture'), 'no-mic')
    assert.equal(dictationError('no-speech'), 'no-speech')
    assert.equal(dictationError('network'), 'network')
    assert.equal(dictationError('otra-cosa'), 'failed')
    assert.match(DICTATION_MESSAGE.denied, /Permite el micrófono/)
    assert.equal(DICTATION_MESSAGE.unsupported, 'Tu navegador no admite dictado; usa Chrome o Edge.')
    assert.equal(DICTATION_MESSAGE.offline, 'El dictado necesita internet.')
  })

  test('sin reconocimiento de voz en el navegador (aquí, Node) avisa que no se admite en lugar de fallar en silencio', () => {
    assert.equal(browserEngine.supported(), false)
    const seen: string[] = []
    browserEngine.start({ onPartial: () => {}, onFinal: () => {}, onError: (e) => seen.push(e), onEnd: () => seen.push('fin') })
    assert.deepEqual(seen, ['unsupported', 'fin'])
    assert.equal(unsupportedMessage(), DICTATION_MESSAGE.unsupported)
  })

  test('Brave tiene la API pero no el servicio de voz: no se ofrece el dictado y se pide Chrome o Edge', () => {
    const g = globalThis as unknown as Record<string, unknown>
    const before = { window: g.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') }
    g.window = { webkitSpeechRecognition: class {} }
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, brave: {} }, configurable: true })
    try {
      assert.equal(browserEngine.supported(), false)
      assert.match(unsupportedMessage(), /Brave/)
      assert.match(unsupportedMessage(), /Chrome o Edge/)
      const seen: string[] = []
      browserEngine.start({ onPartial: () => {}, onFinal: () => {}, onError: (e) => seen.push(e), onEnd: () => seen.push('fin') })
      assert.deepEqual(seen, ['brave', 'fin'])
    } finally {
      g.window = before.window
      if (before.navigator) Object.defineProperty(globalThis, 'navigator', before.navigator)
    }
  })

  test('la falla de red no culpa sólo al internet: también sugiere Chrome o Edge', () => {
    assert.match(DICTATION_MESSAGE.network, /Chrome o Edge/)
  })
})
