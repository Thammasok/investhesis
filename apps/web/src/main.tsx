import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import { readConfig } from '@/config'
import { createAuthClient } from '@/features/auth/create-auth-client'
import { detect } from '@/i18n/detect'
import { setLanguage } from '@/i18n/language'
import '@/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

// Throws a clear error at startup when supabase mode lacks its URL or key.
const authClient = createAuthClient(readConfig(import.meta.env))

// The saved or browser language is in place (Thai chunk loaded) before the first render: no flash.
void setLanguage(detect()).then(() => {
  createRoot(root).render(
    <StrictMode>
      <App authClient={authClient} />
    </StrictMode>,
  )
})
