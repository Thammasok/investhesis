/**
 * Class list for a destructive confirm button (`variant="destructive"`). The tinted variant measures
 * 4.3:1 in light mode (AA needs 4.5:1), so the light theme gets the solid one (white on the destructive
 * colour, 5.2:1); dark mode keeps the tint (4.6:1). The theme token itself is unchanged.
 */
export const SOLID_DESTRUCTIVE_LIGHT =
  'bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/20 dark:text-destructive dark:hover:bg-destructive/30'
