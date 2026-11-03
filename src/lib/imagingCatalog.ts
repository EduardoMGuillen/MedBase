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
export interface ImagingDetails { projections?: string[]; contrast?: 'ct' | 'ct-multi' | 'mr'; side?: boolean; region?: boolean }
export interface ImagingStudy { subgroup: string; name: string; details?: ImagingDetails }

export const IMAGING_SUBGROUPS = ['Rayos X', 'Estudios contrastados', 'Ultrasonido', 'Ultrasonido Doppler', 'Tomografía', 'Resonancia', 'Cardiología', 'Endoscopia', 'Otros']

const P = (...projections: string[]): ImagingDetails => ({ projections })
const L: ImagingDetails = { side: true }
const R: ImagingDetails = { region: true }
const CT: ImagingDetails = { contrast: 'ct' }
const CT3: ImagingDetails = { contrast: 'ct-multi' }
const MR: ImagingDetails = { contrast: 'mr' }
const s = (subgroup: string) => (name: string, ...d: ImagingDetails[]): ImagingStudy => ({ subgroup, name, ...(d.length ? { details: Object.assign({}, ...d) } : {}) })
const rx = s('Rayos X'), fl = s('Estudios contrastados'), us = s('Ultrasonido'), dp = s('Ultrasonido Doppler'), ct = s('Tomografía'), mr = s('Resonancia'), ca = s('Cardiología'), en = s('Endoscopia'), ot = s('Otros')

export const IMAGING_STUDIES: ImagingStudy[] = [
  rx('Rayos X de tórax', P('PA', 'AP', 'Lateral', 'Lordótica apical', 'Decúbito lateral')),
  rx('Rayos X de parrilla costal', L, P('AP', 'Oblicua')),
  rx('Rayos X de abdomen', P('De pie', 'Acostado (decúbito)', 'Decúbito lateral izquierdo')),
  rx('Serie de abdomen agudo'),
  rx('Rayos X de cráneo', P('PA', 'Lateral', 'Towne')),
  rx('Rayos X de senos paranasales', P('Caldwell', 'Waters', 'Lateral')),
  rx('Rayos X de huesos propios de la nariz', P('Lateral', 'Waters')),
  rx('Rayos X de columna cervical', P('AP', 'Lateral', 'Oblicuas', 'Transoral (odontoides)', 'Dinámicas en flexión y extensión')),
  rx('Rayos X de columna dorsal', P('AP', 'Lateral')),
  rx('Rayos X de columna lumbosacra', P('AP', 'Lateral', 'Oblicuas', 'Dinámicas en flexión y extensión')),
  rx('Rayos X de sacro y cóccix', P('AP', 'Lateral')),
  rx('Rayos X de pelvis', P('AP', 'Entrada (inlet)', 'Salida (outlet)')),
  rx('Rayos X de cadera', L, P('AP', 'Lateral (rana)')),
  rx('Rayos X de hombro', L, P('AP', 'AP en rotación interna', 'AP en rotación externa', 'Axial', 'Escapular en Y')),
  rx('Rayos X de clavícula', L, P('AP', 'AP cefálica')),
  rx('Rayos X de húmero', L, P('AP', 'Lateral')),
  rx('Rayos X de codo', L, P('AP', 'Lateral', 'Oblicuas')),
  rx('Rayos X de antebrazo', L, P('AP', 'Lateral')),
  rx('Rayos X de muñeca', L, P('PA', 'Lateral', 'Oblicua')),
  rx('Rayos X de mano', L, P('PA', 'Oblicua', 'Lateral')),
  rx('Rayos X de dedos de la mano', L, R, P('PA', 'Oblicua', 'Lateral')),
  rx('Rayos X de fémur', L, P('AP', 'Lateral')),
  rx('Rayos X de rodilla', L, P('AP', 'Lateral', 'Axial de rótula', 'Túnel', 'De pie con carga')),
  rx('Rayos X de pierna (tibia y peroné)', L, P('AP', 'Lateral')),
  rx('Rayos X de tobillo', L, P('AP', 'Lateral', 'Mortaja')),
  rx('Rayos X de pie', L, P('AP', 'Oblicua', 'Lateral', 'Con carga')),
  rx('Rayos X de calcáneo', L, P('Axial', 'Lateral')),
  rx('Rayos X de edad ósea (mano izquierda)'),

  fl('Esofagograma'),
  fl('Serie esófago-gastroduodenal (SEGD)'),
  fl('Tránsito intestinal'),
  fl('Colon por enema'),
  fl('Urografía excretora'),
  fl('Uretrocistografía miccional'),
  fl('Histerosalpingografía'),
  fl('Fistulografía', R),

  us('Ultrasonido abdominal completo'),
  us('Ultrasonido de hígado y vías biliares'),
  us('Ultrasonido renal y de vías urinarias'),
  us('Ultrasonido pélvico (transabdominal)'),
  us('Ultrasonido transvaginal'),
  us('Ultrasonido obstétrico'),
  us('Ultrasonido obstétrico transvaginal'),
  us('Perfil biofísico fetal'),
  us('Ultrasonido de tiroides'),
  us('Ultrasonido de cuello'),
  us('Ultrasonido de mama', L),
  us('Ultrasonido testicular (escrotal)'),
  us('Ultrasonido de próstata (transabdominal)'),
  us('Ultrasonido de pared abdominal o región inguinal (hernias)', L),
  us('Ultrasonido de partes blandas', R),
  us('Ultrasonido musculoesquelético', L, R),
  us('Ultrasonido de cadera pediátrica', L),
  us('Ultrasonido transfontanelar'),
  us('Ultrasonido de apéndice cecal'),
  us('Ultrasonido de tórax (derrame pleural)'),
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

  ct('Tomografía de cráneo', CT),
  ct('Tomografía de senos paranasales', CT),
  ct('Tomografía de órbitas', CT),
  ct('Tomografía de oídos (peñascos)', CT),
  ct('Tomografía de cuello', CT),
  ct('Tomografía de tórax', CT),
  ct('Tomografía de tórax de alta resolución'),
  ct('Tomografía de abdomen', CT3),
  ct('Tomografía de pelvis', CT3),
  ct('Tomografía de abdomen y pelvis', CT3),
  ct('Tomografía de columna cervical', CT),
  ct('Tomografía de columna dorsal', CT),
  ct('Tomografía de columna lumbar', CT),
  ct('Tomografía de extremidad', CT, L, R),
  ct('Urotomografía'),
  ct('Angiotomografía cerebral'),
  ct('Angiotomografía de tórax (tromboembolia pulmonar)'),
  ct('Angiotomografía de aorta'),
  ct('Angiotomografía de miembros inferiores'),

  mr('Resonancia magnética de cerebro', MR),
  mr('Resonancia magnética de hipófisis (silla turca)', MR),
  mr('Resonancia magnética de órbitas', MR),
  mr('Resonancia magnética de oídos (conductos auditivos internos)', MR),
  mr('Resonancia magnética de cuello', MR),
  mr('Resonancia magnética de columna cervical', MR),
  mr('Resonancia magnética de columna dorsal', MR),
  mr('Resonancia magnética de columna lumbosacra', MR),
  mr('Resonancia magnética de hombro', MR, L),
  mr('Resonancia magnética de codo', MR, L),
  mr('Resonancia magnética de muñeca', MR, L),
  mr('Resonancia magnética de cadera', MR, L),
  mr('Resonancia magnética de rodilla', MR, L),
  mr('Resonancia magnética de tobillo', MR, L),
  mr('Resonancia magnética de abdomen', MR),
  mr('Resonancia magnética de pelvis', MR),
  mr('Resonancia magnética de mama', MR),
  mr('Resonancia magnética multiparamétrica de próstata', MR),
  mr('Colangiorresonancia'),
  mr('Angiorresonancia cerebral'),

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
