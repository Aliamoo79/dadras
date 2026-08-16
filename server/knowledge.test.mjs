import test from 'node:test'
import assert from 'node:assert/strict'
import { listKnowledgeDocuments, searchKnowledge } from './knowledge.mjs'

test('loads the bundled persistent legal reference', async () => {
  const documents = await listKnowledgeDocuments()
  assert.ok(documents.some((document) => document.id === 'iranian-contract-law.md'))
})

test('retrieves relevant legal passages for a case query', async () => {
  const results = await searchKnowledge('خسارت قرارداد و صلاحیت دادگاه صلح')
  assert.ok(results.length > 0)
  assert.ok(results.some((result) => /خسارت|صلح|قرارداد/.test(result.text)))
})

test('returns exact PDF page and article metadata', async () => {
  const civil = await searchKnowledge('ماده ۲۱۹ قانون مدنی عقود لازم الاتباع', 5)
  assert.equal(civil[0]?.source, 'قانون-مدنی.pdf')
  assert.ok(civil.some((result) => result.source === 'قانون-مدنی.pdf' && result.page === 22 && result.citation === 'ماده ۲۱۹'))

  const constitution = await searchKnowledge('اصل هفتاد و پنجم افزایش هزینه عمومی', 3)
  assert.equal(constitution[0]?.citation, 'اصل هفتاد و پنجم')
  assert.equal(constitution[0]?.source, '4354_236.pdf')
})
