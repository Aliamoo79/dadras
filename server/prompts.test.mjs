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

test('injects retrieved sources into the RAG agent only', () => {
  const references = [{ title: 'قانون مدنی', source: 'civil.md', sourceUrl: 'https://example.test/civil', text: 'ماده ۲۱۹: عقود لازم‌الاتباع هستند.' }]
  const rag = buildAgentMessages({ id: 'rag', title: 'بازیابی', instruction: 'منابع را بازیابی کن.' }, caseData, [], references)
  const other = buildAgentMessages({ id: 'facts', title: 'وقایع', instruction: 'وقایع را بخوان.' }, caseData, [], references)
  assert.match(rag[1].content, /retrieved_legal_sources/)
  assert.match(rag[1].content, /ماده ۲۱۹/)
  assert.doesNotMatch(other[1].content, /retrieved_legal_sources/)
})
