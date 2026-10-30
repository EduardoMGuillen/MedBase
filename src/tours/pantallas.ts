import type { TourStep } from './types.js'

/** RG1: mini-recorridos de las pantallas con más detalle (el ícono de ayuda los ofrece en esa pantalla). */
export const PANTALLAS: Record<'consulta' | 'expediente' | 'signos' | 'cobro', { title: string; steps: TourStep[] }> = {
  consulta: {
    title: 'Cómo se escribe la consulta',
    steps: [
      { target: 'consulta-motivo', title: 'Motivo e historia', body: 'Lo que trae al paciente y la historia de la enfermedad actual. Se guarda como borrador mientras escribes.' },
      { target: 'indicaciones', title: 'Indicaciones y plan', body: 'Una por línea. Si escribes un medicamento o un examen, te ofrece pasarlo a su sección.' },
      { target: 'medicamentos', title: 'Medicamentos', body: 'Del vademécum, con dosis, vía, frecuencia y días. Van a la receta (o a la hoja si ingresas al paciente).' },
      { target: 'examenes', title: 'Exámenes', body: 'Laboratorio e Imagen y gabinete por separado: cada grupo sale en su propia orden.' },
      { target: 'firmar', title: 'Firmar', body: 'Firmada no se edita; después sólo se agregan adendas.' },
    ],
  },
  expediente: {
    title: 'El expediente de hospitalización',
    steps: [
      { target: 'expediente-tabs', title: 'Pestañas', body: 'Hoja de hospitalización, signos vitales, notas, medicamentos, notas de enfermería, exámenes y anexos. El número en color es lo pendiente.' },
      { target: 'alertas', title: 'Alertas', body: 'Lo crítico se ve abierto; lo demás, al tocar la barra. Cada alerta lleva al lugar exacto.' },
      { target: 'expediente-completo', title: 'Expediente completo', body: 'Todo en orden para imprimir o guardar en PDF, una sección por hoja.' },
    ],
  },
  signos: {
    title: 'Signos vitales',
    steps: [
      { target: 'signos-ultimo', title: 'Último registro', body: 'El valor más reciente de cada signo, con la hora y quién lo tomó. Sólo lleva color lo que está fuera de rango.' },
      { target: 'signos-curva', title: 'Curva y tendencias', body: 'La curva térmica y las gráficas de los demás signos comparten la escala de tiempo. Toca un punto para ver el detalle.' },
      { target: 'signos-tabla', title: 'Tabla completa', body: 'La hoja clásica, plegada. Una toma equivocada se anula con motivo; no se borra.' },
      { target: 'signos-registrar', title: 'Registrar signos', body: 'Siempre a mano, abajo a la derecha.' },
    ],
  },
  cobro: {
    title: 'Caja',
    steps: [
      { target: 'nuevo-cobro', title: 'Nuevo cobro', body: 'Servicios de la lista o uno nuevo, descuento con motivo, forma de pago y cuánto paga ahora.' },
      { target: 'caja-tabs', title: 'Cobrado hoy, saldos e historial', body: 'Lo cobrado hoy por forma de pago, los saldos pendientes para registrar abonos y el historial de recibos.' },
      { title: 'Recibos', body: 'Cada recibo se imprime o se envía por WhatsApp. Un recibo equivocado se anula con motivo.' },
    ],
  },
}

/** Mini-recorrido de la pantalla actual, si tiene. `has` dice si un `data-tour` está en pantalla. */
export function miniTourFor(pathname: string, has: (target: string) => boolean) {
  if (/^\/app\/consulta\/[^/]+$/.test(pathname)) return PANTALLAS.consulta
  if (/^\/app\/(hospitalizados|observacion)\/[^/]+$/.test(pathname)) return has('signos-ultimo') ? PANTALLAS.signos : PANTALLAS.expediente
  if (pathname === '/app/caja') return PANTALLAS.cobro
  return undefined
}
