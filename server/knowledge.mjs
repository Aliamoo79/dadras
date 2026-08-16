import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'knowledge')
const userRoot = path.join(root, 'user')
const pdfIndexFile = path.join(root, 'pdf-index.json')
const extensions = new Set(['.md', '.txt'])
let cachedPdfIndex
let cachedSearchIndex

const normalize = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/\u200c/g, ' ')
  .replace(/الزم/g, 'لازم')
  .replace(/االتباع/g, 'الاتباع')
  .replace(/اسالم/g, 'اسلام')
  .replace(/اصالح/g, 'اصلاح')
  .replace(/\s+/g, ' ')
  .toLowerCase()

const tokens = (value) => [...new Set(normalize(value).match(/[\p{Script=Arabic}\p{Script=Latin}\p{N}]{2,}/gu) || [])]

async function loadPdfIndex() {
  if (cachedPdfIndex) return cachedPdfIndex
  cachedPdfIndex = JSON.parse(await fs.readFile(pdfIndexFile, 'utf8').catch(() => '{"documents":[],"chunks":[]}'))
  return cachedPdfIndex
}

async function walk(directory) {
  const found = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await walk(target))
    else if (extensions.has(path.extname(entry.name).toLowerCase())) found.push(target)
  }
  return found
}

export async function listKnowledgeDocuments() {
  const files = await walk(root)
  const textDocuments = await Promise.all(files.map(async (file) => {
    const stat = await fs.stat(file)
    const content = await fs.readFile(file, 'utf8')
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, path.extname(file))
    return { id: path.relative(root, file).replaceAll('\\', '/'), title, size: stat.size, updatedAt: stat.mtime.toISOString() }
  }))
  const pdfIndex = await loadPdfIndex()
  return [...pdfIndex.documents, ...textDocuments]
}

export async function saveKnowledgeDocument(title, content) {
  const cleanTitle = String(title || '').trim().slice(0, 140)
  const cleanContent = String(content || '').trim()
  if (!cleanTitle) throw new Error('عنوان منبع وارد نشده است.')
  if (cleanContent.length < 20) throw new Error('متن منبع برای ذخیره کافی نیست.')
  if (cleanContent.length > 1_500_000) throw new Error('حجم متن منبع بیش از حد مجاز است.')
  const slug = cleanTitle.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'document'
  await fs.mkdir(userRoot, { recursive: true })
  const file = path.join(userRoot, `${slug}.md`)
  await fs.writeFile(file, `# ${cleanTitle}\n\n${cleanContent}\n`, 'utf8')
  cachedSearchIndex = undefined
  return { id: path.relative(root, file).replaceAll('\\', '/'), title: cleanTitle }
}

async function buildSearchIndex() {
  if (cachedSearchIndex) return cachedSearchIndex
  const pdfIndex = await loadPdfIndex()
  const chunks = pdfIndex.chunks.map((chunk) => ({ ...chunk, sourceUrl: undefined }))
  const files = await walk(root)
  const documents = await Promise.all(files.map(async (file) => {
    const content = await fs.readFile(file, 'utf8')
    return { id: path.relative(root, file).replaceAll('\\', '/'), title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, path.extname(file)), content }
  }))
  for (const document of documents) {
    const sourceUrl = document.content.match(/^منبع:\s*(https?:\/\/\S+)/m)?.[1]
    for (const text of document.content.split(/\n(?=##?\s)|\n{2,}/).map((item) => item.trim()).filter((item) => item.length > 35)) {
      chunks.push({ title: document.title, source: document.id, sourceUrl, page: null, citation: null, text: text.slice(0, 1450) })
    }
  }
  const postings = new Map()
  chunks.forEach((chunk, index) => {
    const frequencies = new Map()
    for (const token of normalize(`${chunk.citation || ''} ${chunk.text}`).match(/[\p{Script=Arabic}\p{Script=Latin}\p{N}]{2,}/gu) || []) frequencies.set(token, (frequencies.get(token) || 0) + 1)
    for (const [token, frequency] of frequencies) {
      if (!postings.has(token)) postings.set(token, [])
      postings.get(token).push([index, frequency])
    }
  })
  cachedSearchIndex = { chunks, postings }
  return cachedSearchIndex
}

export async function searchKnowledge(query, limit = 5) {
  const queryTokens = tokens(query)
  if (!queryTokens.length) return []
  const { chunks, postings } = await buildSearchIndex()
  const scores = new Map()
  for (const token of queryTokens) {
    const matches = postings.get(token) || []
    const inverseFrequency = Math.log(1 + chunks.length / Math.max(1, matches.length))
    for (const [index, frequency] of matches) scores.set(index, (scores.get(index) || 0) + inverseFrequency * (1 + Math.log(frequency)))
  }
  const normalizedQuery = normalize(query)
  return [...scores.entries()].map(([index, score]) => {
    const chunk = chunks[index]
    const phraseBonus = normalize(chunk.text).includes(normalizedQuery) ? 8 : 0
    const citationBonus = chunk.citation && normalizedQuery.includes(normalize(chunk.citation)) ? 25 : 0
    const primarySourceBonus = chunk.page ? 2 : 0
    return { ...chunk, score: Number((score + phraseBonus + citationBonus + primarySourceBonus).toFixed(3)) }
  }).sort((a, b) => b.score - a.score || a.text.length - b.text.length).slice(0, Math.max(1, Math.min(limit, 10)))
}
