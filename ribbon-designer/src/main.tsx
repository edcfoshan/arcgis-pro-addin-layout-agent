import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import NextRibbonDesigner from './next/NextRibbonDesigner.tsx'

const useLegacyApp = new URLSearchParams(window.location.search).has('legacy')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {useLegacyApp ? <App /> : <NextRibbonDesigner />}
  </StrictMode>,
)
