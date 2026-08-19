export const CATEGORY_NAMES = [
  'DEVELOPMENT',
  'INFRASTRUCTURE',
  'SECURITY',
  'MARKETING',
  'OPERATIONS',
  'SPECULATIVE_ASSET',
  'RELATED_PARTY',
  'OTHER',
] as const

export type CategoryName = (typeof CATEGORY_NAMES)[number]

export const VERSION_STATUS: Record<number, string> = {
  0: 'COMPILED',
  1: 'PARTIAL',
  2: 'REJECTED_CONFLICT',
  3: 'ACCEPTED',
  4: 'ACTIVE',
  5: 'SUPERSEDED',
}

export const OUTCOME_NAMES: Record<number, string> = {
  0: 'ALLOWED',
  1: 'DENIED_CATEGORY',
  2: 'DENIED_CAP',
  3: 'NEEDS_APPROVAL',
  4: 'DENIED_INJECTION',
  5: 'DENIED_MISMATCH',
  6: 'DENIED_BUDGET',
}

export interface PolicyVersion {
  version_id: number
  policy_id: number
  version_number: number
  source_text: string
  source_hash: string
  compiled_hash: string
  default_stance: number
  status: number
  created_at: number
  activated_at: number
  previous_version: number
  superseded_by: number
  rule_count: number
  unmapped_count: number
  unmapped_clauses: number[]
}

export interface Rule {
  rule_type: number
  rule_type_name: string
  category: number
  category_name: string
  int_value: number
  basis: number
  basis_name: string
  source_clause: number
}

export interface SpendCategory {
  category: number
  category_name: string
  spent: number
}

export interface SpendState {
  policy_id: number
  total_budget: number
  total_spent: number
  active_version: number
  spent_by_category: SpendCategory[]
}

export interface Evaluation {
  eval_id: number
  version_id: number
  category: number
  category_name: string
  amount: number
  outcome: number
  outcome_name?: string
  description: string
  evidence_hash: string
  created_at: number
  resolved_at: number
}
