import { WHAT_HINTS, XRAY_PROJECTION_BUTTONS } from './clinicalConfig.js'

/**
 * CA5 (ronda 10): catálogo de Imagen y gabinete (Anexo A del pedido de la ronda 10). VALIDAR: Emil (la lista, las proyecciones
 * por región y qué estudio pide contraste, lado o región).
 *
 * Cada estudio es UNA región; lo que falta para que la orden se pueda cumplir se elige al ordenar:
 *  - `projections`: proyecciones (Rayos X), selección múltiple, obligatoria;
 *  - `contrast`: 'ct' (Tomografía: Simple, Contrastada, Simple y contrastada), 'ct-multi' (además doble y triple: abdomen,
 *    pelvis, abdomen y pelvis) o 'mr' (Resonancia: Simple, Con gadolinio); selección única, obligatoria;
 *  - `side`: Derecho, Izquierdo o Bilateral, obligatorio;
 *  - `region`: texto obligatorio («Región: cara anterior del muslo derecho»), en el campo de región que ya tenía la orden.
 */
export interface ImagingDetails {
  projections?: string[]
  /** 'ct', 'ct-multi' y 'mr' (CA5); 'ct2' y 'mr2' (CA6): los botones de CA6 más un cuadro para escribir otro. */
  contrast?: 'ct' | 'ct-multi' | 'mr' | 'ct2' | 'mr2'
  side?: boolean
  region?: boolean
  /** CA6 (ronda 11): «¿De qué?», texto libre obligatorio («tórax», «rodilla», «abdomen y pelvis»), con un ejemplo gris. */
  what?: boolean
  whatHint?: string
  /** CA6: el lado es opcional (Derecho, Izquierdo, Bilateral). */
  sideOptional?: boolean
  /** CA6: además de los botones de proyección o contraste, se puede escribir otro. */
  free?: boolean
  /** CA6: texto del botón para pedir el mismo estudio otra vez («+ Otro Rayos X»). */
  again?: string
}
export interface ImagingStudy { subgroup: string; name: string; details?: ImagingDetails }

export const IMAGING_SUBGROUPS = ['Rayos X', 'Estudios contrastados', 'Ultrasonido', 'Ultrasonido Doppler', 'Tomografía', 'Resonancia', 'Cardiología', 'Endoscopia', 'Otros']

const L: ImagingDetails = { side: true }
const R: ImagingDetails = { region: true }
const s = (subgroup: string) => (name: string, ...d: ImagingDetails[]): ImagingStudy => ({ subgroup, name, ...(d.length ? { details: Object.assign({}, ...d) } : {}) })
const rx = s('Rayos X'), fl = s('Estudios contrastados'), us = s('Ultrasonido'), dp = s('Ultrasonido Doppler'), ct = s('Tomografía'), mr = s('Resonancia'), ca = s('Cardiología'), en = s('Endoscopia'), ot = s('Otros')

export const IMAGING_STUDIES: ImagingStudy[] = [
  // CA6 (ronda 11): un solo estudio por modalidad; lo demás se escribe al ordenar
  rx('Rayos X', { what: true, whatHint: WHAT_HINTS['Rayos X'], projections: XRAY_PROJECTION_BUTTONS, free: true, side: true, sideOptional: true, again: '+ Otro Rayos X' }),

  fl('Esofagograma'),
  fl('Serie esófago-gastroduodenal (SEGD)'),
  fl('Tránsito intestinal'),
  fl('Colon por enema'),
  fl('Urografía excretora'),
  fl('Uretrocistografía miccional'),
  fl('Histerosalpingografía'),
  fl('Fistulografía', R),

  us('Ultrasonido', { what: true, whatHint: WHAT_HINTS.Ultrasonido, side: true, sideOptional: true, again: '+ Otro ultrasonido' }),
  us('Ultrasonido obstétrico'),
  us('Ultrasonido obstétrico transvaginal'),
  us('Perfil biofísico fetal'),
  us('Ultrasonido FAST (trauma)'),

  dp('Ultrasonido Doppler venoso de miembros inferiores', L),
  dp('Ultrasonido Doppler arterial de miembros inferiores', L),
  dp('Ultrasonido Doppler venoso de miembros superiores', L),
  dp('Ultrasonido Doppler arterial de miembros superiores', L),
  dp('Ultrasonido Doppler carotídeo y vertebral'),
  dp('Ultrasonido Doppler de arterias renales'),
  dp('Ultrasonido Doppler hepático (sistema porta)'),
  dp('Ultrasonido Doppler obstétrico (feto-placentario)'),
  dp('Ultrasonido Doppler testicular'),

  ct('Tomografía', { what: true, whatHint: WHAT_HINTS['Tomografía'], contrast: 'ct2', free: true, side: true, sideOptional: true, again: '+ Otra tomografía' }),
  ct('Angiotomografía', { what: true, whatHint: WHAT_HINTS['Angiotomografía'], again: '+ Otra angiotomografía' }),

  mr('Resonancia magnética', { what: true, whatHint: WHAT_HINTS['Resonancia magnética'], contrast: 'mr2', free: true, side: true, sideOptional: true, again: '+ Otra resonancia magnética' }),
  mr('Angiorresonancia magnética cerebral'),
  mr('Colangiorresonancia'),

  // Cardiología, Endoscopia y Otros: se conservan los que ya existen (sus sinónimos no se duplican: ver IMAGING_SAME)
  ca('Electrocardiograma (EKG) de 12 derivaciones'),
  ca('Ecocardiograma transtorácico'),
  ca('Ecocardiograma transesofágico'),
  ca('Holter de 24 horas'),
  ca('Monitoreo ambulatorio de presión arterial (MAPA) de 24 horas'),
  ca('Prueba de esfuerzo (ergometría)'),
  en('Endoscopia digestiva alta'),
  en('Colonoscopia'),
  en('Rectosigmoidoscopia'),
  en('Colangiopancreatografía retrógrada endoscópica (CPRE)'),
  en('Broncoscopia'),
  en('Laringoscopia'),
  en('Cistoscopia'),
  ot('Mamografía de tamizaje (bilateral)'),
  ot('Mamografía diagnóstica', L),
  ot('Densitometría ósea'),
  ot('Espirometría (con y sin broncodilatador)'),
  ot('Electroencefalograma (EEG)'),
  ot('Electromiografía y velocidades de conducción', R),
  ot('Audiometría'),
  ot('Timpanometría'),
  ot('Polisomnografía'),
  ot('Radiografía panorámica dental (ortopantomografía)'),
]

/**
 * CA5: estudios que ya existían con otro nombre y que son el mismo del Anexo A: se conserva el que ya está (no se duplica).
 * VALIDAR: Emil.
 */
export const IMAGING_SAME: Record<string, string> = {
  'Electrocardiograma (EKG) de 12 derivaciones': 'Electrocardiograma (EKG)',
  'Ecocardiograma transtorácico': 'Ecocardiograma',
  'Espirometría (con y sin broncodilatador)': 'Espirometría',
}

/**
 * CA5 (confirmado por Emil, A1 y A2): los estudios de Imagen y gabinete que se BORRAN del catálogo (Rayos X, Ultrasonido,
 * Tomografía y Resonancia de antes, y la Mamografía genérica). Las órdenes ya emitidas guardan su nombre, así que siguen igual.
 * Los que tienen el mismo nombre en el Anexo A (Ultrasonido obstétrico, de tiroides, de partes blandas) quedan reemplazados por
 * el estudio nuevo con sus detalles.
 */
export const IMAGING_REMOVED = ['Radiografía', 'Radiografía de abdomen', 'Radiografía de tórax', 'Ultrasonido abdominal', 'Ultrasonido de partes blandas', 'Ultrasonido de tiroides',
  'Ultrasonido Doppler', 'Ultrasonido obstétrico', 'Ultrasonido pélvico', 'Ultrasonido renal', 'Tomografía (TAC)', 'Resonancia magnética', 'Mamografía']

/**
 * CA6 (ronda 11, corrige CA5): los estudios por región de Rayos X, Ultrasonido, Tomografía y Resonancia de CA5 se BORRAN del
 * catálogo (decisión de Emil); se piden con el genérico y «¿De qué?». Ultrasonido Doppler, Estudios contrastados,
 * Cardiología, Endoscopia y Otros no cambian. Las órdenes ya emitidas guardan su nombre y siguen igual.
 */
export const IMAGING_REMOVED_CA6 = [
  // Rayos X (28)
  'Rayos X de tórax', 'Rayos X de parrilla costal', 'Rayos X de abdomen', 'Serie de abdomen agudo', 'Rayos X de cráneo', 'Rayos X de senos paranasales',
  'Rayos X de huesos propios de la nariz', 'Rayos X de columna cervical', 'Rayos X de columna dorsal', 'Rayos X de columna lumbosacra', 'Rayos X de sacro y cóccix',
  'Rayos X de pelvis', 'Rayos X de cadera', 'Rayos X de hombro', 'Rayos X de clavícula', 'Rayos X de húmero', 'Rayos X de codo', 'Rayos X de antebrazo',
  'Rayos X de muñeca', 'Rayos X de mano', 'Rayos X de dedos de la mano', 'Rayos X de fémur', 'Rayos X de rodilla', 'Rayos X de pierna (tibia y peroné)',
  'Rayos X de tobillo', 'Rayos X de pie', 'Rayos X de calcáneo', 'Rayos X de edad ósea (mano izquierda)',
  // Ultrasonido (17; se quedan el obstétrico, el obstétrico transvaginal, el perfil biofísico fetal y el FAST)
  'Ultrasonido abdominal completo', 'Ultrasonido de hígado y vías biliares', 'Ultrasonido renal y de vías urinarias', 'Ultrasonido pélvico (transabdominal)',
  'Ultrasonido transvaginal', 'Ultrasonido de tiroides', 'Ultrasonido de cuello', 'Ultrasonido de mama', 'Ultrasonido testicular (escrotal)',
  'Ultrasonido de próstata (transabdominal)', 'Ultrasonido de pared abdominal o región inguinal (hernias)', 'Ultrasonido de partes blandas',
  'Ultrasonido musculoesquelético', 'Ultrasonido de cadera pediátrica', 'Ultrasonido transfontanelar', 'Ultrasonido de apéndice cecal', 'Ultrasonido de tórax (derrame pleural)',
  // Tomografía (19, con las 4 angiotomografías, la urotomografía y la de tórax de alta resolución)
  'Tomografía de cráneo', 'Tomografía de senos paranasales', 'Tomografía de órbitas', 'Tomografía de oídos (peñascos)', 'Tomografía de cuello', 'Tomografía de tórax',
  'Tomografía de tórax de alta resolución', 'Tomografía de abdomen', 'Tomografía de pelvis', 'Tomografía de abdomen y pelvis', 'Tomografía de columna cervical',
  'Tomografía de columna dorsal', 'Tomografía de columna lumbar', 'Tomografía de extremidad', 'Urotomografía', 'Angiotomografía cerebral',
  'Angiotomografía de tórax (tromboembolia pulmonar)', 'Angiotomografía de aorta', 'Angiotomografía de miembros inferiores',
  // Resonancia (18; se quedan la colangiorresonancia y la angiorresonancia, renombrada)
  'Resonancia magnética de cerebro', 'Resonancia magnética de hipófisis (silla turca)', 'Resonancia magnética de órbitas',
  'Resonancia magnética de oídos (conductos auditivos internos)', 'Resonancia magnética de cuello', 'Resonancia magnética de columna cervical',
  'Resonancia magnética de columna dorsal', 'Resonancia magnética de columna lumbosacra', 'Resonancia magnética de hombro', 'Resonancia magnética de codo',
  'Resonancia magnética de muñeca', 'Resonancia magnética de cadera', 'Resonancia magnética de rodilla', 'Resonancia magnética de tobillo',
  'Resonancia magnética de abdomen', 'Resonancia magnética de pelvis', 'Resonancia magnética de mama', 'Resonancia magnética multiparamétrica de próstata',
]
/** CA6: renombrados (nombre de CA5 → nombre nuevo). */
export const IMAGING_RENAMED_CA6: Record<string, string> = { 'Angiorresonancia cerebral': 'Angiorresonancia magnética cerebral' }
