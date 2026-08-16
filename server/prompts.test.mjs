import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentMessages } from './prompts.mjs'

const caseData = { id: '1', title: 'پرونده', category: 'حقوقی', parties: 'الف / ب', amount: '۱۰۰', narrative: 'شرح پرونده' }

test('places the current specialized task after prior context', () => {
  const messages = buildAgentMessages(
    { title: 'وکلای طرفین', instruction: 'استدلال هر دو طرف را مقایسه کن.' },
    caseData,
    [{ title: 'خوانش پرونده', answer: 'خلاصه عمومی پرونده' }],
  )
  const prompt = messages[1].content
  assert.ok(prompt.indexOf('<current_agent_task>') > prompt.indexOf('<prior_context>'))
  assert.match(prompt, /وظیفه انحصاری: استدلال هر دو طرف را مقایسه کن/)
  assert.match(messages[0].content, /گزارش عمومی پرونده یا پاسخ عامل قبلی را تکرار نکنید/)
})

test('bounds accumulated prior-agent context', () => {
  const messages = buildAgentMessages(
    { title: 'بازبینی', instruction: 'رأی را نقد کن.' },
    caseData,
    Array.from({ length: 20 }, (_, index) => ({ title: `عامل ${index}`, answer: 'تکرار '.repeat(1000) })),
  )
  assert.ok(messages[1].content.length < 9000)
  assert.match(messages[1].content, /<current_agent_task>/)
})
