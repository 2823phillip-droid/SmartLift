import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global error capture for the WebView "Load failed" investigation.
// Stores the last N errors in localStorage so we can read them back from
// the device / simulator console, and also prints them to console.error.
const MAX_ERRORS = 50
const STORAGE_KEY = 'askeo_error_log'

const originalConsoleError = console.error.bind(console)

function pushError(err: unknown) {
  let message = 'Unknown error'
  let stack: string | undefined
  if (err instanceof Error) {
    message = err.message
    stack = err.stack
  } else if (typeof err === 'string') {
    message = err
  } else {
    try {
      message = JSON.stringify(err)
    } catch {
      // leave as Unknown error
    }
  }
  const item = {
    timestamp: new Date().toISOString(),
    message,
    stack,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    let list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) list = []
    list.unshift(item)
    if (list.length > MAX_ERRORS) list = list.slice(0, MAX_ERRORS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Ignore storage failures (private browsing, full disk, etc.)
  }
  originalConsoleError('[GlobalError]', message, stack || '')
}

// Catch uncaught JS errors
window.onerror = (message, source, lineno, colno, error) => {
  pushError(error || new Error(`${message} @ ${source}:${lineno}:${colno}`))
  return false
}

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  pushError(event.reason)
})

// Intercept console.error so our own verbose errors are captured too
console.error = (...args: unknown[]) => {
  const first = args[0]
  const maybeError = first instanceof Error ? first : new Error(String(first))
  pushError(maybeError)
  originalConsoleError(...args)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
