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
