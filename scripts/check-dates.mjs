/**
 * GE3 (ronda 9): falla si alguien vuelve a usar un campo nativo de fecha u hora (que muestra mes/día y AM/PM según el
 * idioma del navegador) o un formato de 12 horas. Corre antes del build (`npm run build`) y en las pruebas.
 * Usa DateTimeField, DateField o TimeField (src/components/DateTimeField.tsx) y time()/dmyTime() de src/lib/format.ts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RULES = [
  [/type=\s*["'{]\s*["']?(date|time|datetime-local)["']/, 'campo nativo de fecha u hora'],
  [/hour12:\s*true/, 'formato de 12 horas (hour12: true)'],
  [/hourCycle:\s*["']h1[12]["']/, 'formato de 12 horas (hourCycle h11/h12)'],
  [/["'`]\s*(AM|PM)\s*["'`]/, 'AM/PM'],
]
const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(f)) files.push(p) } }
walk('src')
walk('server')
const bad = []
for (const f of files) {
  if (f.includes('.tmp') || f.endsWith('check-dates.mjs')) continue
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, what] of RULES) if (re.test(line) && !/check-dates: permitido/.test(line)) bad.push(`${f}:${i + 1}: ${what}`)
  })
}
if (bad.length) { console.error(`GE3: fechas y horas deben ser de 24 horas y sin campos nativos:\n${bad.join('\n')}`); process.exit(1) }
console.log(`GE3: sin campos nativos de fecha u hora ni formatos de 12 horas (${files.length} archivos revisados).`)
