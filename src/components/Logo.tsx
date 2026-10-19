/** Isotipo: una línea de pulso dentro de un sello redondeado, con el punto de "latido" en menta. */
export function LogoMark({ size = 32, mono = false }: { size?: number; mono?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill={mono ? 'currentColor' : 'var(--ink)'} />
      <path d="M5 17.5h5.5l2.4-7 3.8 13 2.6-8.5 1.4 2.5H27" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.5" cy="8" r="2.6" fill="var(--mint-strong)" />
    </svg>
  )
}

export function Logo({ size = 30, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className={`logo ${light ? 'logo--light' : ''}`}>
      <LogoMark size={size} />
      <span className="logo__word">clinara</span>
    </span>
  )
}
