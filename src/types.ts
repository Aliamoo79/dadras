import type { LucideIcon } from 'lucide-react'

export type AgentState = 'waiting' | 'running' | 'done'

export interface Agent {
  id: string
  layer: string
  title: string
  subtitle: string
  icon: LucideIcon
  duration: number
  result: string
  evidence: string[]
  instruction: string
}

export type LlmProvider = 'ollama' | 'openai-compatible'

export interface LlmSettings {
  provider: LlmProvider
  baseUrl: string
  model: string
  apiKey: string
  temperature: number
}

export interface AgentResponse {
  answer: string
  model: string
  elapsedMs: number
  references?: RagReference[]
}

export interface RagReference {
  title: string
  source: string
  sourceUrl?: string
  page?: number | null
  citation?: string | null
  text: string
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  event: string
  requestId?: string
  method?: string
  path?: string
  status?: number
  elapsedMs?: number
  provider?: string
  model?: string
  endpoint?: string
  agent?: string
  caseId?: string
  error?: string
  errorType?: string
  upstreamStatus?: number
  upstreamBody?: unknown
  [key: string]: unknown
}

export interface KnowledgeDocument {
  id: string
  title: string
  size: number
  updatedAt: string
}

export interface CaseData {
  id: string
  title: string
  category: string
  branch: string
  urgency: string
  amount: string
  parties: string
  filedAt: string
  summary: string
  narrative: string
}
