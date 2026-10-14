import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App.tsx'

// Dev-only element picker for coding agents; production builds drop this branch.
if (import.meta.env.DEV) {
  void import('react-grab')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Reduced motion drops transform and layout animation but keeps opacity
        and color fades, which still aid comprehension. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
