export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  '0x07b79A05f6Af12d14A88E50CC4A841469aa19ecE'

export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com'
export const STUDIO_RPC = 'https://studio.genlayer.com/api'

export const DEMO_POLICY = `Grant funds may only be used for software development, infrastructure and security audits.
Marketing expenses cannot exceed 20% of the total grant.
Payments to related parties require additional approval.
Purchases of speculative assets are prohibited.`
