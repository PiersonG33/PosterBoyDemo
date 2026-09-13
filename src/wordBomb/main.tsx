// CUSTOM WORD BOMB — standalone application entry point.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import WordBombApp from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WordBombApp />
  </StrictMode>,
)
