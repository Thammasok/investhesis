import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import { readConfig } from '@/config'
import { createAuthClient } from '@/features/auth/create-auth-client'
import { detect, init } from '@/i18n'
import '@/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

// Throws a clear error at startup when supabase mode lacks its URL or key.
const authClient = createAuthClient(readConfig(import.meta.env))

// The saved or detected language is ready before the first render (the Thai chunk loads here), so
// the page never shows English first and then switches.
void init(detect()).then(() => {
  createRoot(root).render(
    <StrictMode>
      <App authClient={authClient} />
    </StrictMode>,
  )
})
