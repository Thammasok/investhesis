import { LANGUAGES, type Language } from '@investhesis/domain'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu'
import { getLanguage, setLanguage } from './language'
import { LANGUAGE_ANNOUNCEMENTS, LANGUAGE_GROUP_LABEL, LANGUAGE_NAMES } from './language-names'

type LanguageSwitchProps = {
  variant: 'menu' | 'inline'
  /** Called after the screen has changed (the account menu saves the choice here). */
  onChosen?: (language: Language) => void
}

/**
 * The language choice. `menu` sits in the account menu (radio items), `inline` in the auth pages' brand
 * row (two buttons). Choosing the current language does nothing; a change is instant and in place.
 */
export function LanguageSwitch({ variant, onChosen }: LanguageSwitchProps) {
  const { i18n } = useTranslation()
  const current: Language = i18n.language === 'th' ? 'th' : 'en'

  async function choose(next: Language) {
    if (next === getLanguage()) return
    await setLanguage(next)
    onChosen?.(next)
  }

  if (variant === 'menu') {
    return (
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{LANGUAGE_GROUP_LABEL}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => void choose(value as Language)}>
          {LANGUAGES.map((language) => (
            <DropdownMenuRadioItem key={language} value={language} lang={language}>
              {LANGUAGE_NAMES[language]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    )
  }

  return (
    <div role="group" aria-label={LANGUAGE_GROUP_LABEL} className="flex gap-1">
      {(['th', 'en'] as const).map((language) => (
        <Button
          key={language}
          type="button"
          size="sm"
          variant={current === language ? 'secondary' : 'ghost'}
          aria-pressed={current === language}
          lang={language}
          className="h-7 px-2 text-xs"
          onClick={() => void choose(language)}
        >
          {LANGUAGE_NAMES[language]}
        </Button>
      ))}
    </div>
  )
}

/** A polite live region (`role="log"` is polite by itself) that says the new language name once per change (the toaster is not used). */
export function LanguageAnnouncer() {
  const { i18n } = useTranslation()
  const [text, setText] = useState('')
  useEffect(() => {
    const onChanged = (language: string) => setText(LANGUAGE_ANNOUNCEMENTS[language === 'th' ? 'th' : 'en'])
    i18n.on('languageChanged', onChanged)
    return () => i18n.off('languageChanged', onChanged)
  }, [i18n])
  return (
    <div role="log" aria-atomic="true" data-language-announcer className="sr-only">
      {text}
    </div>
  )
}
