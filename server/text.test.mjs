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

test('repairs joined Persian legal compounds using ordinary spaces', () => {
  assert.equal(
    sanitizeModelText('صورتوضعیتهای تفصیلی، پیشپرداخت و قراردادها لازمالاتباع میباشد.'),
    'صورت وضعیت های تفصیلی، پیش پرداخت و قرارداد ها لازم الاتباع می باشد.',
  )
  assert.equal(
    sanitizeModelText('دستهبندی اسناد، اولویت بندی، تصمیمگیری و قانونگذاری'),
    'دسته بندی اسناد، اولویت بندی، تصمیم گیری و قانون گذاری',
  )
  assert.equal(sanitizeModelText('**نتیجه تخصصی این مرحله**'), '**نتیجه**')
})
