import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeModelText } from './text.mjs'

test('removes unsupported scripts while preserving Persian and English', () => {
  const result = sanitizeModelText('مرجع امور граждан یا Commercial Court')
  assert.equal(result, 'مرجع امور  یا Commercial Court')
  assert.doesNotMatch(result, /\p{Script=Cyrillic}/u)
})

test('normalizes Arabic letter variants to Persian forms', () => {
  assert.equal(sanitizeModelText('يك كتاب'), 'یک کتاب')
})
