import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { CONTRACT_ADDRESS } from './config'
import { errorCode, normalizeError } from './errors'
import type {
  Evaluation,
  PolicyVersion,
  Rule,
  SpendState,
} from './types'

export type Address = `0x${string}`

export type ConnectResult = {
  address: Address
  /** Non-fatal: the wallet is connected but something optional did not complete. */
  warning?: string
}

export const STUDIO_CHAIN_ID = 61999
export const STUDIO_CHAIN_ID_HEX = '0xf22f'

/**
 * Parameters MetaMask needs to add the network. The RPC here is the direct
 * Studio endpoint, not this app's /genlayer-rpc proxy: the wallet dials it
 * itself and cannot use a same-origin path. App reads still go via the proxy.
 */
const STUDIO_CHAIN_PARAMS = {
  chainId: STUDIO_CHAIN_ID_HEX,
  chainName: 'Genlayer Studio Network',
  rpcUrls: ['https://studio.genlayer.com/api'],
  nativeCurrency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
  blockExplorerUrls: ['https://explorer-studio.genlayer.com'],
}

export type StateWaitResult<T> =
  | { status: 'confirmed'; value: T }
  | { status: 'pending'; lastValue?: T }

export interface WaitForStateChangeOptions<T> {
  read: () => Promise<T>
  isDone: (value: T) => boolean
  intervalMs?: number
  timeoutMs?: number
}

// Use the same-origin proxy in both local Vite and Vercel.
// - Local: vite.config.ts proxies /genlayer-rpc -> https://studio.genlayer.com/api
// - Vercel: vercel.json rewrites /genlayer-rpc -> https://studio.genlayer.com/api
//
// Do NOT point local development at 127.0.0.1:8787 unless a separate RPC
// process is actually running there.
const RPC_URL = `${window.location.origin}/genlayer-rpc`

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Poll contract STATE, not transaction receipts.
 *
 * StudioNet receipt polling from the browser can hit CORS/rate-limit errors even
 * after a transaction has landed. Contract reads go through the app RPC proxy,
 * so confirmation is based on the state transition that proves each write.
 */
export async function waitForStateChange<T>({
  read,
  isDone,
  intervalMs = 4_000,
  timeoutMs = 120_000,
}: WaitForStateChangeOptions<T>): Promise<StateWaitResult<T>> {
  const startedAt = Date.now()
  let lastValue: T | undefined

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await read()
      lastValue = value

      if (isDone(value)) {
        return { status: 'confirmed', value }
      }
    } catch {
      // A read can transiently fail while StudioNet is busy. The write hash is
      // already known, so keep polling state rather than turning a read hiccup
      // into a false transaction failure.
    }

    const remaining = timeoutMs - (Date.now() - startedAt)
    if (remaining <= 0) break
    await sleep(Math.min(intervalMs, remaining))
  }

  return {
    status: 'pending',
    ...(lastValue === undefined ? {} : { lastValue }),
  }
}

/**
 * Add/switch MetaMask to GenLayer Studio.
 *
 * Done explicitly here rather than inside the SDK's connect() so that each step
 * has its own error, and so a failure at a later, optional step cannot undo it.
 */
export async function ensureStudioChain(): Promise<void> {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed.')
  }

  const current = (await window.ethereum.request({
    method: 'eth_chainId',
  })) as string

  if (
    typeof current === 'string' &&
    current.toLowerCase() === STUDIO_CHAIN_ID_HEX
  ) {
    return
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIO_CHAIN_ID_HEX }],
    })
    return
  } catch (switchError) {
    // 4902 = chain unknown to the wallet. Anything else is a real failure
    // (user rejection, pending request, unsupported wallet) and must surface.
    if (String(errorCode(switchError) ?? '') !== '4902') {
      throw switchError
    }
  }

  await window.ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [STUDIO_CHAIN_PARAMS],
  })

  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: STUDIO_CHAIN_ID_HEX }],
  })
}

/**
 * Connect the wallet.
 *
 * Ordering matters. The account is authoritative the moment eth_requestAccounts
 * resolves, so it is returned even if a later step fails. Previously the account
 * was only returned after the SDK's connect() had also added the network,
 * switched to it, queried wallet_getSnaps and installed the GenLayer Snap — none
 * of which is guarded inside the SDK. Dismissing the optional Snap prompt threw,
 * so the caller never learned the account and the UI stayed disconnected while
 * the wallet was, in fact, connected and on the right chain.
 *
 * The Snap is not required here: in genlayer-js 1.1.8 the snap APIs are used
 * only inside connect() and the metamaskClient() diagnostic helper. Reads go
 * over HTTP through the RPC proxy and writes use plain eth_sendTransaction.
 * It is therefore attempted best-effort and can never block connection.
 */
export async function connectWallet(): Promise<ConnectResult> {
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
  let warning: string | undefined

  try {
    await ensureStudioChain()
  } catch (chainError) {
    console.warn('[PolicyVault] network switch did not complete', chainError)
    warning = `Connected, but MetaMask is not on GenLayer Studio yet: ${
      normalizeError(chainError).message
    }`
  }

  // Best-effort only: installs the optional GenLayer Snap for wallets that
  // support it. Never throws out of this function.
  //
  // Skipped when the chain step already failed: the SDK's connect() repeats the
  // add/switch prompts internally, and re-prompting someone who just declined
  // is worse than not offering the optional Snap at all.
  if (warning === undefined) {
    try {
      const client = createClient({
        chain: rpcStudionet,
        account: address,
        provider: window.ethereum,
      })
      await client.connect('studionet')
    } catch (snapError) {
      console.warn(
        '[PolicyVault] optional GenLayer Snap step skipped',
        snapError,
      )
    }
  }

  return warning === undefined ? { address } : { address, warning }
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
  // write() never calls the SDK's connect(), so nothing else guarantees the
  // wallet is on GenLayer Studio. Checking here costs one eth_chainId call and
  // shows no prompt when the chain is already correct.
  await ensureStudioChain()

  const client = writeClient(account)

  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: 0n,
  })

  // Do not poll transaction receipts in the browser.
  // StudioNet may return 429/CORS during polling
  // even when the transaction finalizes successfully.
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
  })

  return normalize<T>(value)
}

export const createPolicy = (
  account: Address,
  totalBudget: number,
) =>
  write(
    account,
    'create_policy',
    [totalBudget],
  )

export const compileVersion = (
  account: Address,
  policyId: number,
  sourceText: string,
) =>
  write(
    account,
    'compile_version',
    [
      policyId,
      sourceText,
    ],
  )

export const acceptVersion = (
  account: Address,
  policyId: number,
  versionId: number,
  compiledHash: string,
) =>
  write(
    account,
    'accept_version',
    [
      policyId,
      versionId,
      compiledHash,
    ],
  )

export const activateVersion = (
  account: Address,
  policyId: number,
  versionId: number,
) =>
  write(
    account,
    'activate_version',
    [
      policyId,
      versionId,
    ],
  )

export const classifyAndEvaluate = (
  account: Address,
  policyId: number,
  description: string,
  amount: number,
  evidence: string,
) =>
  write(
    account,
    'classify_and_evaluate',
    [
      policyId,
      description,
      amount,
      evidence,
    ],
  )

export const approveEvaluation = (
  account: Address,
  policyId: number,
  evalId: number,
) =>
  write(
    account,
    'approve_evaluation',
    [
      policyId,
      evalId,
    ],
  )

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

/**
 * Find the last contiguous policy id readable from the contract. Policy IDs are
 * monotonically allocated by create_policy(). This is used only to establish a
 * pre-submit baseline so createPolicy can confirm the next policy by STATE.
 */
export async function findLatestPolicyId(
  hint = 1,
  maxSteps = 128,
): Promise<number> {
  let id = Math.max(1, Math.trunc(hint))

  // If the hint itself does not exist, walk down to a known starting point.
  try {
    await getSpendState(id)
  } catch {
    id = 1
  }

  let latest = 0
  for (let step = 0; step < maxSteps; step++) {
    try {
      await getSpendState(id)
      latest = id
      id += 1
    } catch {
      return latest
    }
  }

  return latest
}

/** Same baseline helper for globally allocated policy-version IDs. */
export async function findLatestVersionId(
  hint = 1,
  maxSteps = 256,
): Promise<number> {
  let id = Math.max(1, Math.trunc(hint))

  try {
    await getVersion(id)
  } catch {
    id = 1
  }

  let latest = 0
  for (let step = 0; step < maxSteps; step++) {
    try {
      await getVersion(id)
      latest = id
      id += 1
    } catch {
      return latest
    }
  }

  return latest
}

export function explorerTx(
  hash: string,
) {
  return `https://explorer-studio.genlayer.com/tx/${hash}`
}
