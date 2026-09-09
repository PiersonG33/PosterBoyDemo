export function getTextDensityClass(length: number) {
  if (length > 300) return 'note-text--tiny'
  if (length > 170) return 'note-text--dense'
  if (length > 80) return 'note-text--medium'
  return 'note-text--short'
}
