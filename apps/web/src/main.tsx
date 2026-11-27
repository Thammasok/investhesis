import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import { readConfig } from '@/config'
import { createAuthClient } from '@/features/auth/create-auth-client'
// Not the '@/i18n' barrel: it re-exports the helpers that pull in the domain package and zod, which belong in the page chunks.
import { detect } from '@/i18n/detect'
import { initLanguage } from '@/i18n/language'
import '@/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

// Throws a clear error at startup when supabase mode lacks its URL or key.
const authClient = createAuthClient(readConfig(import.meta.env))

// The saved or detected language is ready before the first render (the Thai chunk loads here), so
// the page never shows English first and then switches (FR-003, FR-014).
void initLanguage(detect()).then(() => {
  createRoot(root).render(
    <StrictMode>
      <App authClient={authClient} />
    </StrictMode>,
  )
})
