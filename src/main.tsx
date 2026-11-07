import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './modules.css'
import './clinical.css'
import './boards.css'
import './responsive.css'
import App from './App.tsx'
import { installAutoCapitalize } from './lib/autocap'

// GE10 (ronda 14): mayúscula inicial en los campos de texto narrativo, una sola vez para toda la app
installAutoCapitalize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
