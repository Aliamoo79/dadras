import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUploadedCaseData } from './case.mjs'

test('builds case data from uploaded document text instead of sample content', () => {
  const result = buildUploadedCaseData({ filename: 'پرونده-پیمانکاری.pdf', pages: 3, text: 'خواهان مطالبه وجه صورت وضعیت نهایی قرارداد پیمانکاری را دارد. '.repeat(5) })
  assert.equal(result.title, 'پرونده-پیمانکاری')
  assert.match(result.narrative, /مطالبه وجه/)
  assert.doesNotMatch(result.narrative, /شرکت سازه‌گستر/)
})
