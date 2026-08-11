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
