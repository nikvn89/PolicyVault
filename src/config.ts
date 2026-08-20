export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  '0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb' // Steward-fixed StudioNet deployment

export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com'
export const STUDIO_RPC = 'https://studio.genlayer.com/api'

export const DEMO_POLICY = `Grant funds may only be used for software development, infrastructure and security audits.
Marketing expenses cannot exceed 20% of the total grant.
Payments to related parties require additional approval.
Purchases of speculative assets are prohibited.`
