const allowedCharacter = /[\p{Script=Arabic}\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u

export function sanitizeModelText(value) {
  return [...String(value || '').normalize('NFKC')]
    .filter((character) => allowedCharacter.test(character))
    .join('')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\uFFFD/g, '')
}
