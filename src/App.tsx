import { useCallback, useEffect, useMemo, useState } from 'react'
import { CONTRACT_ADDRESS, DEMO_POLICY, EXPLORER_BASE } from './config'
import {
  acceptVersion,
  activateVersion,
  approveEvaluation,
  classifyAndEvaluate,
  compileVersion,
  connectWallet,
  createPolicy,
  explorerTx,
  findLatestPolicyId,
  findLatestVersionId,
  getActiveVersion,
  getPolicyEvaluations,
  getRules,
  getSpendState,
  getVersion,
  waitForStateChange,
  type Address,
} from './genlayer'
import { OUTCOME_NAMES, VERSION_STATUS, type Evaluation, type PolicyVersion, type Rule, type SpendState } from './types'

const fmt = new Intl.NumberFormat('en-US')

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function formatTime(ts: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function outcomeClass(outcome: number) {
  if (outcome === 0) return 'good'
  if (outcome === 3) return 'warn'
  return 'bad'
}

export default function App() {
  const [account, setAccount] = useState<Address | null>(null)
  const [policyIdInput, setPolicyIdInput] = useState('1')
  const [policyId, setPolicyId] = useState<number | null>(null)
  const [versionIdInput, setVersionIdInput] = useState('1')
  const [version, setVersion] = useState<PolicyVersion | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [spend, setSpend] = useState<SpendState | null>(null)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])

  const [budget, setBudget] = useState('100000')
  const [policyText, setPolicyText] = useState(DEMO_POLICY)
  const [description, setDescription] = useState('Pay 1000 GEN for backend infrastructure hosting')
  const [amount, setAmount] = useState('1000')
  const [evidence, setEvidence] = useState('')

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [lastTx, setLastTx] = useState('')
  const [error, setError] = useState('')
  const [actionState, setActionState] = useState<{
    key: string
    phase: 'idle' | 'submitting' | 'waiting' | 'confirmed' | 'pending' | 'error'
    note?: string
  }>({ key: '', phase: 'idle' })

  const activeVersionId = spend?.active_version || 0

  const loadPolicy = useCallback(async (id: number) => {
    // A fresh policy legitimately has active_version = 0.
    // Load the required spend state first; optional empty-version data must not fail the whole screen.
    const state = await getSpendState(id)

    setSpend(state)
    setPolicyId(id)
    setPolicyIdInput(String(id))

    try {
      const evals = await getPolicyEvaluations(id)
      setEvaluations([...evals].reverse())
    } catch {
      setEvaluations([])
    }

    const targetVersion = Number(state.active_version || 0)

    if (targetVersion > 0) {
      const [v, r] = await Promise.all([getVersion(targetVersion), getRules(targetVersion)])
      setVersion(v)
      setRules(r)
      setVersionIdInput(String(targetVersion))
    } else {
      setVersion(null)
      setRules([])
    }
  }, [])

  function actionLabel(key: string, idle: string) {
    if (actionState.key !== key) return idle
    if (actionState.phase === 'submitting') return 'Submitting…'
    if (actionState.phase === 'waiting') return 'Waiting for confirmation…'
    if (actionState.phase === 'confirmed') return 'Confirmed ✓'
    if (actionState.phase === 'pending') return 'Still pending'
    return idle
  }

  async function runConfirmedAction<T>({
    key,
    submitting,
    waiting,
    confirmed,
    pending,
    submit,
    confirm,
    onConfirmed,
    waitingNote,
  }: {
    key: string
    submitting: string
    waiting: string
    confirmed: string
    pending: string
    submit: () => Promise<{ hash: string }>
    confirm: () => ReturnType<typeof waitForStateChange<T>>
    onConfirmed?: (value: T) => Promise<void> | void
    waitingNote?: string
  }) {
    if (busy) return

    setBusy(true)
    setError('')
    setActionState({ key, phase: 'submitting' })
    setStatus(submitting)

    try {
      const { hash } = await submit()
      setLastTx(hash)
      setActionState({ key, phase: 'waiting', note: waitingNote })
      setStatus(waiting)

      const result = await confirm()

      if (result.status === 'confirmed') {
        await onConfirmed?.(result.value)
        setActionState({ key, phase: 'confirmed' })
        setStatus(confirmed)
      } else {
        setActionState({ key, phase: 'pending' })
        setStatus(pending)
      }
    } catch (e) {
      setActionState({ key, phase: 'error' })
      setError(e instanceof Error ? e.message : String(e))
      setStatus('Transaction failed before state confirmation')
    } finally {
      setBusy(false)
    }
  }

  async function onConnect() {
    try {
      setError('')
      const a = await connectWallet()
      setAccount(a)
      setStatus('Wallet connected ✓')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onCreatePolicy() {
    if (!account) return onConnect()
    const n = Number(budget)
    if (!Number.isInteger(n) || n <= 0) return setError('Budget must be a positive integer.')

    setStatus('Checking current policy state…')
    const baseline = await findLatestPolicyId(policyId ?? (Number(policyIdInput) || 1))
    const expectedPolicyId = baseline + 1

    await runConfirmedAction<SpendState>({
      key: 'create',
      submitting: 'Submitting policy creation…',
      waiting: `Transaction submitted — waiting for policy #${expectedPolicyId} to become readable…`,
      confirmed: `Policy #${expectedPolicyId} confirmed ✓`,
      pending: `Still pending after 120s. The transaction may still finalize — check the explorer link before submitting again.`,
      submit: () => createPolicy(account, n),
      confirm: () => waitForStateChange({
        read: () => getSpendState(expectedPolicyId),
        isDone: (state) => state.policy_id === expectedPolicyId && state.total_budget === n,
      }),
      onConfirmed: async () => {
        await loadPolicy(expectedPolicyId)
      },
    })
  }

  async function onLoadPolicy() {
    const id = Number(policyIdInput)
    if (!Number.isInteger(id) || id <= 0) return setError('Enter a valid policy ID.')
    setBusy(true)
    setError('')
    setStatus('Loading policy…')
    try {
      await loadPolicy(id)
      setStatus('Policy loaded ✓')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('Load failed')
    } finally {
      setBusy(false)
    }
  }

  async function onLoadVersion() {
    const id = Number(versionIdInput)
    if (!Number.isInteger(id) || id <= 0) return setError('Enter a valid version ID.')
    setBusy(true)
    setError('')
    try {
      const [v, r] = await Promise.all([getVersion(id), getRules(id)])
      setVersion(v)
      setRules(r)
      setStatus('Version loaded ✓')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onCompile() {
    if (!account || !policyId) return

    setStatus('Checking current version state…')
    const baseline = await findLatestVersionId(Number(versionIdInput) || 1)
    const expectedVersionId = baseline + 1

    await runConfirmedAction<PolicyVersion>({
      key: 'compile',
      submitting: 'Submitting policy compilation…',
      waiting: `Compilation submitted — waiting for version #${expectedVersionId}. AI validator consensus usually takes 30–60 seconds…`,
      confirmed: `Version #${expectedVersionId} compiled and confirmed ✓`,
      pending: 'Compilation is still pending after 120s. It may still finalize — use the explorer link and do not submit a duplicate write.',
      waitingNote: 'AI validator consensus normally takes 30–60 seconds.',
      submit: () => compileVersion(account, policyId, policyText),
      confirm: () => waitForStateChange({
        read: () => getVersion(expectedVersionId),
        isDone: (v) => v.policy_id === policyId && v.compiled_hash.length > 0 && v.rule_count > 0,
        timeoutMs: 120_000,
      }),
      onConfirmed: async (v) => {
        const r = await getRules(v.version_id)
        setVersion(v)
        setRules(r)
        setVersionIdInput(String(v.version_id))
      },
    })
  }

  async function onAccept() {
    if (!account || !policyId || !version) return
    const versionId = version.version_id

    await runConfirmedAction<PolicyVersion>({
      key: 'accept',
      submitting: 'Submitting compiled-hash acceptance…',
      waiting: `Acceptance submitted — waiting for version #${versionId} status to become ACCEPTED…`,
      confirmed: 'Accepted and timelock started ✓',
      pending: 'Acceptance is still pending after 120s. Check the explorer link before trying again.',
      submit: () => acceptVersion(account, policyId, versionId, version.compiled_hash),
      confirm: () => waitForStateChange({
        read: () => getVersion(versionId),
        isDone: (v) => v.status === 3,
      }),
      onConfirmed: (v) => setVersion(v),
    })
  }

  async function onActivate() {
    if (!account || !policyId || !version) return
    const versionId = version.version_id

    await runConfirmedAction<Awaited<ReturnType<typeof getActiveVersion>>>({
      key: 'activate',
      submitting: 'Submitting policy activation…',
      waiting: `Activation submitted — waiting for policy #${policyId} active version to become #${versionId}…`,
      confirmed: `Version #${versionId} active ✓`,
      pending: 'Activation is still pending after 120s. Check the explorer link before trying again.',
      submit: () => activateVersion(account, policyId, versionId),
      confirm: () => waitForStateChange({
        read: () => getActiveVersion(policyId),
        isDone: (active) => active.version_id === versionId,
      }),
      onConfirmed: async () => loadPolicy(policyId),
    })
  }

  async function onEvaluate() {
    if (!account || !policyId) return
    const n = Number(amount)
    if (!Number.isInteger(n) || n <= 0) return setError('Amount must be a positive integer.')

    const before = await getPolicyEvaluations(policyId)
    const beforeCount = before.length

    await runConfirmedAction<Evaluation[]>({
      key: 'evaluate',
      submitting: 'Submitting spend for validator classification…',
      waiting: 'Evaluation submitted — waiting for the on-chain evaluation count to increase…',
      confirmed: 'Spend evaluation confirmed ✓',
      pending: 'Evaluation is still pending after 120s. Check the explorer link before trying again.',
      submit: () => classifyAndEvaluate(account, policyId, description, n, evidence),
      confirm: () => waitForStateChange({
        read: () => getPolicyEvaluations(policyId),
        isDone: (items) => items.length > beforeCount,
      }),
      onConfirmed: async () => loadPolicy(policyId),
    })
  }

  async function onApprove(evalId: number) {
    if (!account || !policyId) return

    await runConfirmedAction<Evaluation[]>({
      key: `approve-${evalId}`,
      submitting: `Submitting approval for evaluation #${evalId}…`,
      waiting: `Approval submitted — waiting for evaluation #${evalId} to resolve…`,
      confirmed: `Evaluation #${evalId} approval confirmed ✓`,
      pending: `Approval #${evalId} is still pending after 120s. Check the explorer link before trying again.`,
      submit: () => approveEvaluation(account, policyId, evalId),
      confirm: () => waitForStateChange({
        read: () => getPolicyEvaluations(policyId),
        isDone: (items) => {
          const target = items.find((item) => item.eval_id === evalId)
          return Boolean(target && target.outcome !== 3 && target.resolved_at > 0)
        },
      }),
      onConfirmed: async () => loadPolicy(policyId),
    })
  }

  useEffect(() => {
    if (!window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      if (accounts?.[0]) setAccount(accounts[0] as Address)
    }).catch(() => undefined)
  }, [])

  const usagePct = useMemo(() => {
    if (!spend?.total_budget) return 0
    return Math.min(100, (spend.total_spent / spend.total_budget) * 100)
  }, [spend])

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">GENLAYER · STUDIONET</div>
          <h1>PolicyVault</h1>
          <p className="subtitle">Consensus-compiled treasury authorization ledger</p>
        </div>
        <div className="header-actions">
          <a className="ghost" href={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
            {shortAddress(CONTRACT_ADDRESS)} ↗
          </a>
          <div className="connect-stack">
            <button className="primary small" onClick={onConnect}>{account ? shortAddress(account) : 'Connect MetaMask'}</button>
            <span className="connect-note">First time: MetaMask may ask to add/switch GenLayer Studio (chain 61999) and install the GenLayer Snap.</span>
          </div>
        </div>
      </header>

      <section className="hero card">
        <div>
          <span className="pill">AI interprets meaning</span>
          <h2>Natural-language policy → canonical rules → deterministic authorization ledger.</h2>
          <p>GenLayer validator consensus compiles policy language and classifies spend intent. The contract authorizes and records decisions using category rules, per-transaction caps, category-share caps, aggregate budget, approvals, and persistent accounting. It does not custody or transfer funds.</p>
        </div>
        <div className="hero-stat">
          <span>Contract</span>
          <strong>{shortAddress(CONTRACT_ADDRESS)}</strong>
          <span>Status</span>
          <strong className="online">AUTHORIZATION LEDGER</strong>
        </div>
      </section>

      <div className={`statusline phase-${actionState.phase}`}>
        <span className={busy ? 'dot pulse' : 'dot'} />
        <div className="status-copy">
          <strong>{status}</strong>
          {actionState.note && <span>{actionState.note}</span>}
        </div>
        {lastTx && <a href={explorerTx(lastTx)} target="_blank" rel="noreferrer">View transaction ↗</a>}
      </div>
      {error && <div className="error">{error}</div>}

      <section className="grid two">
        <div className="card">
          <div className="section-title"><span>01</span><h3>Create / Load Policy</h3></div>
          <label>Total budget</label>
          <div className="inline">
            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" />
            <button disabled={busy} onClick={onCreatePolicy}>{actionLabel('create', 'Create Policy')}</button>
          </div>
          <div className="divider" />
          <label>Existing policy ID</label>
          <div className="inline">
            <input value={policyIdInput} onChange={(e) => setPolicyIdInput(e.target.value)} placeholder="e.g. 1" inputMode="numeric" />
            <button className="secondary" disabled={busy} onClick={onLoadPolicy}>Load Policy</button>
          </div>
        </div>

        <div className="card">
          <div className="section-title"><span>LIVE</span><h3>Budget State</h3></div>
          {spend ? (
            <>
              <div className="stats">
                <div><span>Budget</span><strong>{fmt.format(spend.total_budget)}</strong></div>
                <div><span>Spent</span><strong>{fmt.format(spend.total_spent)}</strong></div>
                <div><span>Remaining</span><strong>{fmt.format(spend.total_budget - spend.total_spent)}</strong></div>
              </div>
              <div className="progress"><div style={{ width: `${usagePct}%` }} /></div>
              <div className="tiny">{usagePct.toFixed(1)}% of total budget used · Active version #{activeVersionId || '—'}</div>
            </>
          ) : <div className="empty">Load a policy to inspect live accounting.</div>}
        </div>
      </section>

      <section className="card">
        <div className="section-title"><span>02</span><h3>Consensus Policy Compiler</h3></div>
        <label>Natural-language policy</label>
        <textarea rows={7} value={policyText} onChange={(e) => setPolicyText(e.target.value)} />
        <div className="row-actions">
          <button className="primary" disabled={busy || !account || !policyId} onClick={onCompile}>{actionLabel('compile', 'Compile with Consensus')}</button>
          <span className="hint">Max 6 clauses. Compilation creates an immutable canonical version.</span>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <div className="section-title"><span>03</span><h3>Compiled Version</h3></div>
          <label>Version ID</label>
          <div className="inline">
            <input value={versionIdInput} onChange={(e) => setVersionIdInput(e.target.value)} placeholder="e.g. 1" inputMode="numeric" />
            <button className="secondary" disabled={busy} onClick={onLoadVersion}>Load Version</button>
          </div>
          {version && (
            <div className="version-box">
              <div className="kv"><span>Status</span><strong>{VERSION_STATUS[version.status] ?? version.status}</strong></div>
              <div className="kv"><span>Rules</span><strong>{version.rule_count}</strong></div>
              <div className="kv"><span>Unmapped</span><strong>{version.unmapped_count}</strong></div>
              <div className="hash"><span>Compiled hash</span><code>{version.compiled_hash}</code></div>
              <div className="lifecycle">
                <button disabled={busy || version.status > 1} onClick={onAccept}>{actionLabel('accept', 'Accept Hash')}</button>
                <button className="primary" disabled={busy || version.status !== 3} onClick={onActivate}>{actionLabel('activate', 'Activate')}</button>
              </div>
              {version.status === 3 && <p className="tiny">Activation available after: {formatTime(version.activated_at)}</p>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title"><span>IR</span><h3>Canonical Rules</h3></div>
          {rules.length ? <div className="rule-list">{rules.map((r, i) => (
            <div className="rule" key={`${r.rule_type}-${r.category}-${i}`}>
              <div><span className="rule-num">R{i + 1}</span><strong>{r.rule_type_name}</strong></div>
              <div>{r.category_name}</div>
              <div>{r.rule_type_name === 'CATEGORY_CAP_PCT' ? `${r.int_value / 100}% ${r.basis_name}` : r.int_value ? fmt.format(r.int_value) : '—'}</div>
            </div>
          ))}</div> : <div className="empty">Load a compiled version to inspect canonical rules.</div>}
        </div>
      </section>

      <section className="card evaluator">
        <div className="section-title"><span>04</span><h3>AI Spend Evaluator</h3></div>
        <div className="grid form-grid">
          <div>
            <label>Spend description</label>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label>Amount</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
            <label>Optional evidence</label>
            <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="URL, reference, or context" />
          </div>
        </div>
        <div className="row-actions">
          <button className="primary" disabled={busy || !account || !policyId || !activeVersionId} onClick={onEvaluate}>{actionLabel('evaluate', 'Classify & Evaluate')}</button>
          <span className="hint">AI only classifies economic purpose. Contract logic decides ALLOW / DENY / NEEDS_APPROVAL.</span>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <div className="section-title"><span>05</span><h3>Category Accounting</h3></div>
          {spend ? <div className="category-list">{spend.spent_by_category.map((c) => (
            <div className="category-row" key={c.category}>
              <span>{c.category_name}</span><strong>{fmt.format(c.spent)}</strong>
            </div>
          ))}</div> : <div className="empty">No policy loaded.</div>}
        </div>

        <div className="card">
          <div className="section-title"><span>06</span><h3>Evaluation Audit Trail</h3></div>
          {evaluations.length ? <div className="eval-list">{evaluations.map((e) => (
            <div className="eval" key={e.eval_id}>
              <div className="eval-top">
                <strong>#{e.eval_id} · {e.category_name}</strong>
                <span className={`verdict ${outcomeClass(e.outcome)}`}>{e.outcome_name ?? OUTCOME_NAMES[e.outcome] ?? e.outcome}</span>
              </div>
              <p>{e.description}</p>
              <div className="eval-meta"><span>{fmt.format(e.amount)} GEN</span><span>{formatTime(e.created_at)}</span></div>
              {e.outcome === 3 && <button disabled={busy || !account} onClick={() => onApprove(e.eval_id)}>{actionLabel(`approve-${e.eval_id}`, 'Approve Evaluation')}</button>}
            </div>
          ))}</div> : <div className="empty">No evaluations recorded yet.</div>}
        </div>
      </section>

      <footer>
        <div><strong>PolicyVault</strong> · Built on GenLayer</div>
        <div>AI interprets meaning. Deterministic state controls consequences.</div>
      </footer>
    </main>
  )
}
