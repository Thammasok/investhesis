import type { Settings } from '../concentration-model'

export type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  /** Where focus starts: Threshold from the header button, Rate from Set rate. */
  initialFocus: 'threshold' | 'rate'
  /** The button that opened it, so focus can go back (the Set rate button may be gone after a save). */
  returnFocusTo?: React.RefObject<HTMLElement | null>
}

/**
 * The slot for T-008. The page already owns the open state and the Settings and Set rate wiring;
 * T-008 replaces this body with the dialog (ux-design.md §Concentration settings dialog), submitting
 * `{ intent: 'save-settings', patch }` as JSON to the route action (`createConcentrationAction`).
 */
export function ConcentrationSettingsDialog(_props: SettingsDialogProps) {
  return null
}
