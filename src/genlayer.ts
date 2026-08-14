import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { CONTRACT_ADDRESS } from './config'
import type {
  Evaluation,
  PolicyVersion,
  Rule,
  SpendState,
} from './types'

export type Address = `0x${string}`

const RPC_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:8787'
  : `${window.location.origin}/genlayer-rpc`

const rpcStudionet = {
  ...studionet,
  rpcUrls: {
    ...studionet.rpcUrls,
    default: {
      ...studionet.rpcUrls.default,
      http: [RPC_URL] as [string],
    },
  },
} as typeof studionet

const readClient = createClient({
  chain: rpcStudionet,
})

function normalize<T>(value: unknown): T {
  return value as T
}

export async function connectWallet(): Promise<Address> {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed.')
  }

  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[]

  if (!accounts?.[0]) {
    throw new Error('No wallet account returned.')
  }

  const address = accounts[0] as Address

  const client = createClient({
    chain: rpcStudionet,
    account: address,
    provider: window.ethereum,
  })

  await client.connect('studionet')

  return address
}

function writeClient(account: Address) {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed.')
  }

  return createClient({
    chain: rpcStudionet,
    account,
    provider: window.ethereum,
  })
}

async function write(
  account: Address,
  functionName: string,
  args: any[],
) {
  const client = writeClient(account)

  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: 0n,
  })

  // Do not poll transaction receipts in the browser.
  // StudioNet polling can hit 429/CORS even when the tx
  // has already finalized successfully.
  return { hash }
}

async function read<T>(
  functionName: string,
  args: any[],
): Promise<T> {
  const value = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: 'accepted',
  })

  return normalize<T>(value)
}

export const createPolicy = (
  account: Address,
  totalBudget: number,
) =>
  write(account, 'create_policy', [
    totalBudget,
  ])

export const compileVersion = (
  account: Address,
  policyId: number,
  sourceText: string,
) =>
  write(account, 'compile_version', [
    policyId,
    sourceText,
  ])

export const acceptVersion = (
  account: Address,
  policyId: number,
  versionId: number,
  compiledHash: string,
) =>
  write(account, 'accept_version', [
    policyId,
    versionId,
    compiledHash,
  ])

export const activateVersion = (
  account: Address,
  policyId: number,
  versionId: number,
) =>
  write(account, 'activate_version', [
    policyId,
    versionId,
  ])

export const classifyAndEvaluate = (
  account: Address,
  policyId: number,
  description: string,
  amount: number,
  evidence: string,
) =>
  write(account, 'classify_and_evaluate', [
    policyId,
    description,
    amount,
    evidence,
  ])

export const approveEvaluation = (
  account: Address,
  policyId: number,
  evalId: number,
) =>
  write(account, 'approve_evaluation', [
    policyId,
    evalId,
  ])

export const getVersion = (
  versionId: number,
) =>
  read<PolicyVersion>(
    'get_version',
    [versionId],
  )

export const getRules = (
  versionId: number,
) =>
  read<Rule[]>(
    'get_rules',
    [versionId],
  )

export const getSpendState = (
  policyId: number,
) =>
  read<SpendState>(
    'get_spend_state',
    [policyId],
  )

export const getPolicyEvaluations = (
  policyId: number,
) =>
  read<Evaluation[]>(
    'get_policy_evaluations',
    [policyId],
  )

export async function getActiveVersion(
  policyId: number,
) {
  return read<{
    policy_id: number
    version_id: number
    version_number?: number
    compiled_hash: string
    status?: number
  }>(
    'get_active_version',
    [policyId],
  )
}

export function explorerTx(hash: string) {
  return `https://explorer-studio.genlayer.com/tx/${hash}`
}
