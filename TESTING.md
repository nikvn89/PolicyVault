# PolicyVault --- Testing

## Steward-Fixed Test Deployment

-   Network: GenLayer StudioNet
-   Contract: `0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb`
-   Explorer: https://explorer-studio.genlayer.com/address/0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb
-   Policy ID: `1`
-   Total Budget: `100`

The historical section below is retained for the earlier pre-fix deployment. The final steward regression record is at the end of this document.

## Historical Test Environment (Pre-Steward Fix)

-   Network: GenLayer StudioNet
-   Contract: `0x07b79A05f6Af12d14A88E50CC4A841469aa19ecE`
-   Policy ID: `1`
-   Compiled Version ID: `1`
-   Total Budget: `100000 GEN`


## Frontend Confirmation / Onboarding Regression

### State-based transaction confirmation

The browser does **not** poll transaction receipts. Each write is confirmed by polling the state transition that proves it finalized, through the existing RPC proxy. Poll interval: **4 seconds**. Confirmation timeout: **120 seconds**.

Expected confirmation checks:

- `create_policy` → the new policy ID becomes readable via `get_spend_state`.
- `compile_version` → the new version becomes readable via `get_version`, with a compiled hash and populated rules.
- `accept_version` → `get_version.status == ACCEPTED`.
- `activate_version` → `get_active_version.version_id` equals the activated version.
- `classify_and_evaluate` → `get_policy_evaluations` count increases.
- `approve_evaluation` → the target evaluation changes from `NEEDS_APPROVAL` and has `resolved_at > 0`.

The UI exposes three explicit write phases: **Submitting → Waiting for confirmation → Confirmed**. During waiting it displays the Explorer transaction link. `compile_version` also states that AI consensus typically takes 30–60 seconds. If state is not confirmed within 120 seconds, the UI shows **Still pending** rather than reporting a false failure, and tells the user to inspect the transaction before retrying.

### First-time MetaMask setup

`connectWallet()` requests the account first, then performs explicit GenLayer StudioNet chain handling.

Expected behavior:

```text
- Account approval succeeds → wallet becomes connected immediately.
- GenLayer Studio uses chain ID 61999.
- GenLayer Snap is optional for this dApp.
- Dismissing / not installing the Snap must not clear the connected account.
- Wallet/provider failures must render readable messages, never [object Object].
```

### Fresh-account GEN / gas requirement

GenLayer write operations consume gas and require the signing account to have enough native GEN. Studionet's native currency is GEN. A fresh zero-GEN account therefore must be funded before it can submit PolicyVault writes. Studionet provides a built-in faucet using the **💧 button in the Studio account selector**.

Verification source: official GenLayer documentation for Writing to Intelligent Contracts and Networks.

## 1. Policy Compilation

Natural-language policy:

``` text
Grant funds may only be used for software development, infrastructure and security audits.
Marketing expenses cannot exceed 20% of the total grant.
Payments to related parties require additional approval.
Purchases of speculative assets are prohibited.
```

Expected canonical rules:

``` text
ALLOW_CATEGORY     DEVELOPMENT
ALLOW_CATEGORY     INFRASTRUCTURE
ALLOW_CATEGORY     SECURITY
DENY_CATEGORY      SPECULATIVE_ASSET
CATEGORY_CAP_PCT   MARKETING       20% TOTAL_BUDGET
REQUIRE_APPROVAL   RELATED_PARTY
```

Observed:

``` text
Status: ACTIVE
Rules: 6
Unmapped: 0
```

Result: **PASS**

## 2. Allowed Infrastructure Spend

Input:

``` text
Description: Pay 1000 GEN for backend infrastructure hosting
Amount: 1000
```

Observed:

``` text
Category: INFRASTRUCTURE
Result: ALLOWED
```

Accounting:

``` text
INFRASTRUCTURE = 1000
```

Result: **PASS**

## 3. Prohibited Category

Input:

``` text
Description: Buy speculative crypto assets for 5000 GEN
Amount: 5000
```

Observed:

``` text
Category: SPECULATIVE_ASSET
Result: DENIED_CATEGORY
```

The denied amount was not added to category accounting.

Result: **PASS**

## 4. Marketing Within Cap

Input:

``` text
Description: Pay 19000 GEN for marketing campaign and advertising
Amount: 19000
```

With a total budget of 100,000 GEN, the marketing cap is 20,000 GEN.

Observed:

``` text
Category: MARKETING
Result: ALLOWED
MARKETING accounting: 19000
```

Result: **PASS**

## 5. Marketing Cap Authorization

Input:

``` text
Description: Pay 2000 GEN for additional marketing campaign
Amount: 2000
```

Existing marketing spend:

``` text
19000 GEN
```

Requested cumulative marketing spend:

``` text
21000 GEN
```

Maximum allowed:

``` text
20000 GEN
```

Observed:

``` text
Category: MARKETING
Result: DENIED_CAP
```

Repeated evaluation was also denied and `MARKETING` remained `19000`.

Result: **PASS**

## 6. Related-Party Approval Requirement

Input:

``` text
Description: Pay 1000 GEN to a related-party company for consulting services
Amount: 1000
```

Observed:

``` text
Category: RELATED_PARTY
Result: NEEDS_APPROVAL
```

Before approval:

``` text
RELATED_PARTY = 0
```

Result: **PASS**

## 7. Related-Party Approval

The pending related-party evaluation was approved using the approval
action.

Observed final accounting:

``` text
Budget       = 100000
Spent        = 21000
Remaining    = 79000

INFRASTRUCTURE    = 1000
MARKETING         = 19000
RELATED_PARTY     = 1000
SPECULATIVE_ASSET = 0
```

Result: **PASS**

## Functional Test Summary

  Test                   Expected               Result
  ---------------------- ---------------------- --------
  Policy compilation     6 rules / 0 unmapped   PASS
  Infrastructure         ALLOWED                PASS
  Speculative asset      DENIED_CATEGORY        PASS
  Marketing within cap   ALLOWED                PASS
  Marketing over cap     DENIED_CAP             PASS
  Related party          NEEDS_APPROVAL         PASS
  Approval               Accounting updated     PASS

**Core functional flow: PASS**


---

# Steward-Fix Regression Tests — Redeployed Contract

- Network: GenLayer StudioNet
- Contract: `0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb`
- Explorer: https://explorer-studio.genlayer.com/address/0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb
- Policy ID: `1`
- Total budget: `100`
- Active version: `1`
- Compiled hash: `21cd0106333fdc893ace6f3b84e09e6e54c2d99b5db88c1dcdf5263894feb6a1`
- Compiled rules: `4`
- Unmapped clauses: `0`

The deployed write schema exposes `classify_and_evaluate` and does not expose the removed public `record_spend` path. Spend category therefore comes from GenLayer consensus classification before deterministic rule evaluation.

## Regression 1 — Aggregate budget denial

Observed sequence:

```text
INFRASTRUCTURE 90 -> ALLOWED
total_spent = 90

INFRASTRUCTURE 20 -> outcome 6 / DENIED_BUDGET
total_spent remains 90
INFRASTRUCTURE remains 90
```

**Result: PASS**

## Regression 2 — Budget denial before approval routing

With `total_spent = 90` and `total_budget = 100`:

```text
RELATED_PARTY 20
consensus category = RELATED_PARTY
outcome = 6 / DENIED_BUDGET
```

The request did not become `NEEDS_APPROVAL`, proving aggregate budget denial takes priority once the request is already over budget.

**Result: PASS**

## Regression 3 — Pending approval cannot bypass exhausted budget

Observed sequence:

```text
eval_id 4: RELATED_PARTY 10 -> NEEDS_APPROVAL
eval_id 5: INFRASTRUCTURE 10 -> ALLOWED
total_spent = 100
approve_evaluation(policy_id=1, eval_id=4) -> outcome 6 / DENIED_BUDGET
```

The pending related-party amount was not added to accounting after the budget was exhausted.

**Result: PASS**

## Regression 4 — Caller-selected category bypass removed

Submitted description:

```text
Pay 5 units for a social media advertising campaign, recorded by the requester as infrastructure hosting.
```

Consensus output:

```text
category = MARKETING
injection_suspected = false
stated_amount = 5
```

The caller's attempted infrastructure label did not control the category. The deployed write-method list also contains no public `record_spend` method.

**Result: PASS**

## Regression 5 — Per-transaction cap distinct from budget denial

Submitted:

```text
INFRASTRUCTURE amount = 120
```

Observed Studio result:

```text
output = 2 / DENIED_CAP
classification = INFRASTRUCTURE
stated_amount = 120
```

This distinguishes the per-transaction cap failure (`2`) from aggregate budget failure (`6`). In the supplied Studio capture this transaction was `ACCEPTED / SUCCESS`; a separate `FINALIZED` capture was not provided in the chat, so finality should be rechecked in Studio/Explorer before representing this individual transaction as finalized.

**Result: PASS for rule/output behavior; finality capture pending**

## Final steward-fix state observed

After the finalized accounting steps:

```text
total_budget = 100
total_spent = 100
INFRASTRUCTURE = 100
RELATED_PARTY = 0
```

Core steward properties demonstrated:

```text
DENIED_BUDGET exists and is enforced on aggregate spend.
Budget denial occurs before NEEDS_APPROVAL when already over budget.
Owner approval re-check cannot bypass the current aggregate budget.
Caller-selected category bypass is removed; consensus classification is mandatory.
DENIED_CAP remains a distinct result from DENIED_BUDGET.
```

---

# Live Vercel Integration — Final Verification

- Frontend: https://policy-vault-dun.vercel.app/
- Contract used by the live frontend: `0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb`
- Policy ID: `1`

The live Vercel deployment was reconfigured to the steward-fixed contract and verified against the existing on-chain policy state.

## Vercel 1 — Load final accounting state

Observed in the live UI:

```text
INFRASTRUCTURE = 100
total_budget = 100
total_spent = 100
```

The frontend successfully read the redeployed contract state.

**Result: PASS**

## Vercel 2 — Consensus classification still controls category

Submitted through the live frontend:

```text
Description: Pay 5 units for social media advertising.
Amount: 5
Evidence: Invoice for social media advertising services.
```

Observed audit result:

```text
Category: MARKETING
Outcome: DENIED_CATEGORY
```

This is expected because the active test policy permits infrastructure and related-party spending, not marketing. The denied request did not increase category accounting.

**Result: PASS**

## Vercel 3 — Aggregate budget denial through the dApp

Submitted through the live frontend:

```text
Description: Pay 5 units for production infrastructure hosting.
Amount: 5
Evidence: Invoice for production infrastructure hosting.
```

Observed audit result:

```text
#10 · INFRASTRUCTURE
Outcome: DENIED_BUDGET
```

The request was classified as an allowed category, then rejected deterministically because the aggregate budget was already `100 / 100`. Infrastructure accounting remained `100`.

**Result: PASS**

## Live Integration Result

```text
Correct redeployed contract loaded        PASS
On-chain policy/accounting state read     PASS
Consensus spend classification            PASS
DENIED_CATEGORY rendered correctly        PASS
DENIED_BUDGET rendered correctly          PASS
Denied spend leaves accounting unchanged  PASS
```

**PolicyVault frontend + steward-fixed contract integration: FINAL PASS**

---

## Wallet Connection Fixes (Aug 20 steward request)

Steward request:

```text
Wallet connection doesn't work, I get - in UI [object Object]
```

### Root cause

Two separate defects on the same path.

1. **Display.** `src/App.tsx` rendered thrown values with
   `e instanceof Error ? e.message : String(e)`. Wallet providers reject with
   serialised EIP-1193 objects (`{ code, message, data }`), not `Error`
   instances, and `String(<plain object>)` is literally `"[object Object]"`.

2. **Behaviour — the actual failure.** `connectWallet()` returned the address
   only after `client.connect('studionet')` had also added the network,
   switched to it, called `wallet_getSnaps` and installed the GenLayer Snap.
   None of those steps is guarded inside `genlayer-js@1.1.8`. Dismissing the
   optional Snap prompt threw, so `setAccount` never ran and the UI stayed
   disconnected even though the wallet was connected and on the right chain.

The GenLayer Snap is not required by this application: in `genlayer-js@1.1.8`
the snap APIs appear only inside `connect()` and the `metamaskClient()`
diagnostic helper. Reads go over HTTP through the RPC proxy and writes use
plain `eth_sendTransaction`.

### Changes

```text
src/errors.ts       NEW - normalises Error / EIP-1193 object / string / unknown,
                          maps 4001 / 4100 / 4902 / -32002 / -32601 / -32603 to
                          readable copy, and console.errors the raw value
src/genlayer.ts     connectWallet() sets the account as soon as
                          eth_requestAccounts resolves; explicit
                          ensureStudioChain() (switch, then add on 4902);
                          the Snap step is best-effort and cannot block
                    write() calls ensureStudioChain() before every write
src/App.tsx         all four catch sites use reportError(); dismissible error
                          banner; accountsChanged listener; Connecting… state
src/styles.css      error banner close button, max-height, scroll
.env.example        corrected to the live contract address
.gitignore          was a single space-separated line, so nothing was ignored
                          (including .env) - rewritten one pattern per line
genlayer.ts (root)  DELETED - stale duplicate that still used
                          waitForTransactionReceipt, contradicting the README
```

### Verification status for the Aug 20 wallet fix

#### Verified locally

**Reject account prompt**

Observed in the browser:

```text
Wallet connection failed
You rejected the request in your wallet. (code 4001)
```

Result:

```text
PASS — readable EIP-1193 error
PASS — no [object Object]
PASS — Connect MetaMask button returned
```

**Local RPC proxy regression**

Before the proxy correction, DevTools showed:

```text
POST http://127.0.0.1:8787/
net::ERR_CONNECTION_REFUSED
GenLayer RPC error: Failed to fetch
```

The frontend was corrected to use:

```text
http://localhost:5173/genlayer-rpc
→ Vite proxy
→ https://studio.genlayer.com/api
```

After that correction, the raw `127.0.0.1:8787` connection-refused failure no longer blocked the tested create flow.

Result:

```text
PASS — obsolete 127.0.0.1:8787 path removed from current source
```

**Write while MetaMask UI showed another network**

During the local retest, MetaMask visibly showed Ethereum while `Create Policy` was triggered. The previous raw RPC failure did not recur; the UI progressed to:

```text
Transaction submitted — waiting for policy #2 to become readable...
```

and the newly created policy became readable in the frontend.

Result:

```text
PASS — tested write no longer fails with raw code -1 / connection refused
NOTE — no separate screenshot of an add/switch-network prompt was captured,
       so do not claim that specific prompt behavior was visually verified.
```

#### Still required before resubmission

```text
[ ] npm run build on the current V7 source
    EXPECTED: PASS, 0 TypeScript errors

[ ] Reload the current V7 page
    EXPECTED: account restores; policy state can be loaded

[ ] Verify Vercel environment:
    VITE_CONTRACT_ADDRESS =
    0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb

[ ] Redeploy the current source to Vercel

[ ] On live Vercel:
    Connect MetaMask
    EXPECTED: connected wallet displayed, no [object Object]

[ ] On live Vercel:
    Load an existing policy
    EXPECTED: contract state loads through /genlayer-rpc
```

No contract change was made. Deployment
`0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb` is unchanged and all earlier
contract regression results above remain valid.

## Current local proxy requirement

With `npm run dev`, GenLayer RPC requests must use:

```text
http://localhost:5173/genlayer-rpc
```

and Vite must proxy that path to:

```text
https://studio.genlayer.com/api
```

The current frontend must not use:

```text
http://127.0.0.1:8787
```

unless a separate local service is intentionally introduced in a future revision.
