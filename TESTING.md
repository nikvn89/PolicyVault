# PolicyVault --- Testing

## Test Environment

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

`connectWallet()` uses the GenLayer Studionet connection flow. A first-time user should expect MetaMask prompts to add/switch **GenLayer Studio (chain 61999)** and install/approve the **GenLayer MetaMask Snap**.

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

## 5. Marketing Cap Enforcement

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
