export const OPEN_GTM_AUTONOMY_MODES = [
  'off',
  'safe',
  'dry-run',
  'background',
  'full'
] as const

export type OpenGtmAutonomyMode = (typeof OPEN_GTM_AUTONOMY_MODES)[number]

export function isOpenGtmAutonomyMode(value: string): value is OpenGtmAutonomyMode {
  return OPEN_GTM_AUTONOMY_MODES.includes(value as OpenGtmAutonomyMode)
}

export function normalizeAutonomyMode(
  value: string | boolean | undefined,
  fallback: OpenGtmAutonomyMode = 'off'
): OpenGtmAutonomyMode {
  if (typeof value !== 'string') return fallback
  return isOpenGtmAutonomyMode(value) ? value : fallback
}
