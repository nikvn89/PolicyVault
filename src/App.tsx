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
  getPolicyEvaluations,
  getRules,
  getSpendState,
  getVersion,
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

  async function run(label: string, fn: () => Promise<{ hash: string }>, refresh = true) {
    if (busy) return
    setBusy(true)
    setError('')
    setStatus(label)

    try {
      const { hash } = await fn()
      setLastTx(hash)

      // Submission succeeded. Finalization happens asynchronously on StudioNet.
      // Avoid browser-side receipt polling because Studio RPC can return 429/CORS
      // even while the transaction finalizes successfully.
      setStatus('Submitted ✓ — waiting for StudioNet finalization')

      if (refresh && policyId) {
        window.setTimeout(() => {
          loadPolicy(policyId).catch(() => undefined)
        }, 30000)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('Submit failed')
    } finally {
      setBusy(false)
    }
  }

  async function onConnect() {
    try {
      setError('')
      const a = await connectWallet()
      setAccount(a)
      setStatus('Wallet connected')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onCreatePolicy() {
    if (!account) return onConnect()
    const n = Number(budget)
    if (!Number.isInteger(n) || n <= 0) return setError('Budget must be a positive integer.')
    await run('Creating policy — do not submit again while pending…', () => createPolicy(account, n), false)
    setStatus('Policy created. Enter its policy ID below, then Load Policy.')
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
    await run('Compiling with validator consensus…', () => compileVersion(account, policyId, policyText), false)
    setStatus('Compilation submitted ✓. Wait for finalization, then Load Version.')
  }

  async function onAccept() {
    if (!account || !policyId || !version) return
    await run('Accepting compiled hash…', () => acceptVersion(account, policyId, version.version_id, version.compiled_hash), false)
    const v = await getVersion(version.version_id)
    setVersion(v)
    setStatus('Accepted. Timelock started ✓')
  }

  async function onActivate() {
    if (!account || !policyId || !version) return
    await run('Activating policy version…', () => activateVersion(account, policyId, version.version_id))
  }

  async function onEvaluate() {
    if (!account || !policyId) return
    const n = Number(amount)
    if (!Number.isInteger(n) || n <= 0) return setError('Amount must be a positive integer.')
    await run('Validators are classifying the spend…', () => classifyAndEvaluate(account, policyId, description, n, evidence))
  }

  async function onApprove(evalId: number) {
    if (!account || !policyId) return
    await run(`Approving evaluation #${evalId}…`, () => approveEvaluation(account, policyId, evalId))
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
          <p className="subtitle">Consensus-compiled treasury policy enforcement</p>
        </div>
        <div className="header-actions">
          <a className="ghost" href={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
            {shortAddress(CONTRACT_ADDRESS)} ↗
          </a>
          <button className="primary small" onClick={onConnect}>{account ? shortAddress(account) : 'Connect MetaMask'}</button>
        </div>
      </header>

      <section className="hero card">
        <div>
          <span className="pill">AI interprets meaning</span>
          <h2>Natural-language policy → canonical rules → deterministic enforcement.</h2>
          <p>GenLayer validator consensus compiles policy language and classifies spend intent. The contract alone enforces category rules, caps, approvals, and persistent accounting.</p>
        </div>
        <div className="hero-stat">
          <span>Contract</span>
          <strong>{shortAddress(CONTRACT_ADDRESS)}</strong>
          <span>Status</span>
          <strong className="online">FINAL DEPLOYMENT</strong>
        </div>
      </section>

      <div className="statusline">
        <span className={busy ? 'dot pulse' : 'dot'} /> {status}
        {lastTx && <a href={explorerTx(lastTx)} target="_blank" rel="noreferrer">View last transaction ↗</a>}
      </div>
      {error && <div className="error">{error}</div>}

      <section className="grid two">
        <div className="card">
          <div className="section-title"><span>01</span><h3>Create / Load Policy</h3></div>
          <label>Total budget</label>
          <div className="inline">
            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" />
            <button disabled={busy} onClick={onCreatePolicy}>Create Policy</button>
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
          <button className="primary" disabled={busy || !account || !policyId} onClick={onCompile}>Compile with Consensus</button>
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
                <button disabled={busy || version.status > 1} onClick={onAccept}>Accept Hash</button>
                <button className="primary" disabled={busy || version.status !== 3} onClick={onActivate}>Activate</button>
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
          <button className="primary" disabled={busy || !account || !policyId || !activeVersionId} onClick={onEvaluate}>Classify & Evaluate</button>
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
                <span className={`verdict ${outcomeClass(e.outcome)}`}>{OUTCOME_NAMES[e.outcome] ?? e.outcome}</span>
              </div>
              <p>{e.description}</p>
              <div className="eval-meta"><span>{fmt.format(e.amount)} GEN</span><span>{formatTime(e.created_at)}</span></div>
              {e.outcome === 3 && <button disabled={busy || !account} onClick={() => onApprove(e.eval_id)}>Approve Evaluation</button>}
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
