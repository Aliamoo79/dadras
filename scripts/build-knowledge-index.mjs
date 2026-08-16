import fs from 'node:fs/promises'
import path from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const outputFile = path.join(projectRoot, 'knowledge', 'pdf-index.json')
const sources = [
  { file: '4354_236.pdf', title: 'قانون اساسی جمهوری اسلامی ایران به همراه نظرات تفسیری شورای نگهبان', kind: 'constitution' },
  { file: 'قانون-مدنی.pdf', title: 'قانون مدنی جمهوری اسلامی ایران', kind: 'civil-code' },
]

const normalize = (value) => String(value || '').normalize('NFKC')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\u00ad/g, '')
  .replace(/الزم/g, 'لازم').replace(/االتباع/g, 'الاتباع').replace(/اسالم/g, 'اسلام').replace(/اصالح/g, 'اصلاح')
  .replace(/\s+/g, ' ').trim()

function splitPage(text, source, page) {
  const marker = source.kind === 'civil-code' ? /(?=ماده\s+[۰-۹0-9]+)/g : /(?=اصل\s+[\p{Script=Arabic}۰-۹0-9]+)/gu
  const sections = text.split(marker).map(normalize).filter((item) => item.length >= 35)
  const chunks = []
  for (const section of sections.length ? sections : [text]) {
    const material = section.match(/^(ماده\s+[۰-۹0-9]+)/u)?.[1]
    const principle = section.match(/^(اصل\s+[^\s–—-]+(?:\s+و\s+[^\s–—-]+)?)/u)?.[1]
    const citation = material || principle
    for (let start = 0; start < section.length; start += 1200) {
      const slice = section.slice(start, start + 1450).trim()
      if (slice.length >= 35) chunks.push({ id: `${source.file}:${page}:${chunks.length + 1}`, title: source.title, source: source.file, page, citation: citation || null, text: slice })
    }
  }
  return chunks
}

const documents = []
const chunks = []
for (const source of sources) {
  const filePath = path.join(projectRoot, source.file)
  const stat = await fs.stat(filePath)
  const pdf = await getDocument({ data: new Uint8Array(await fs.readFile(filePath)) }).promise
  documents.push({ id: `pdf:${source.file}`, title: source.title, source: source.file, size: stat.size, updatedAt: stat.mtime.toISOString(), pages: pdf.numPages })
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = normalize(content.items.map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`).join(''))
    chunks.push(...splitPage(text, source, pageNumber))
  }
  console.log(`${source.file}: ${pdf.numPages} pages indexed`)
}

await fs.mkdir(path.dirname(outputFile), { recursive: true })
await fs.writeFile(outputFile, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), documents, chunks }), 'utf8')
console.log(`${chunks.length} searchable chunks written to ${path.relative(projectRoot, outputFile)}`)
