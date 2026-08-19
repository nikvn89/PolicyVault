# PolicyVault

**Consensus-compiled treasury authorization and accounting ledger on GenLayer.**

## First-time setup

PolicyVault uses the GenLayer MetaMask integration. On the first connection, MetaMask may show several prompts in sequence:

1. add the **GenLayer Studio** network,
2. switch to that network, and
3. install/approve the **GenLayer MetaMask Snap**.

These prompts are expected. Studionet uses **chain ID 61999** and **GEN** as its native currency.

### Native GEN for transactions

GenLayer write transactions consume gas and the signing account must have enough native GEN to pay transaction fees. A fresh account with no GEN therefore needs funding before it can submit PolicyVault write actions. On Studionet, use the built-in **💧 faucet button in the Studio account selector** to fund the account with test GEN.

The frontend deliberately does not browser-poll transaction receipts. Instead, after every write it polls the contract state through the existing RPC proxy every 4 seconds, for up to 120 seconds, and confirms the exact state transition that proves the write landed. If confirmation is still pending after the timeout, the UI keeps the transaction hash/explorer link visible and warns the user not to submit a duplicate write.

PolicyVault converts natural-language treasury policies into canonical
rules through GenLayer validator consensus, then records and authorizes
spending decisions against those rules in a persistent on-chain ledger.

## Problem

Treasury and grant policies are often written in natural language. Rules
such as permitted purposes, spending caps, prohibited categories, and
related-party approval requirements require interpretation before they
can be evaluated consistently and recorded on-chain.

Traditional smart contracts are good at deterministic rule evaluation, but
they cannot reliably interpret arbitrary natural-language spending
intent on their own.

## Solution

PolicyVault separates interpretation from deterministic authorization and accounting:

1.  A policy is created with a fixed total budget.
2.  Natural-language policy text is compiled through GenLayer validator
    consensus.
3.  The resulting canonical version contains structured rules.
4.  The compiled hash is accepted and the version is activated.
5.  Spend requests are classified by GenLayer consensus.
6.  Deterministic contract logic evaluates the active rules, including the aggregate budget.
7.  Only `ALLOWED` decisions update persistent category and total-spend
    accounting.
8.  Restricted related-party spending remains pending until explicitly
    approved.

This creates a clear boundary:

**AI interprets meaning. Deterministic state controls the authorization ledger.**

## Example Canonical Policy

The tested policy stated:

-   Grant funds may only be used for software development,
    infrastructure and security audits.
-   Marketing expenses cannot exceed 20% of the total grant.
-   Payments to related parties require additional approval.
-   Purchases of speculative assets are prohibited.

It compiled into six canonical rules:

-   `ALLOW_CATEGORY — DEVELOPMENT`
-   `ALLOW_CATEGORY — INFRASTRUCTURE`
-   `ALLOW_CATEGORY — SECURITY`
-   `DENY_CATEGORY — SPECULATIVE_ASSET`
-   `CATEGORY_CAP_PCT — MARKETING — 20% TOTAL_BUDGET`
-   `REQUIRE_APPROVAL — RELATED_PARTY`

The tested compilation produced **6 rules and 0 unmapped clauses**.

## Authorization Outcomes

PolicyVault supports deterministic outcomes including:

-   `ALLOWED`
-   `DENIED_CATEGORY`
-   `DENIED_CAP`
-   `NEEDS_APPROVAL`
-   `DENIED_BUDGET`

A denied or pending evaluation does not increase spend accounting. A
related-party evaluation only becomes accounted spending after the
approval action succeeds.

## Tested Flow

Using a policy budget of **100,000 GEN**:

-   Infrastructure hosting, 1,000 GEN → `ALLOWED`
-   Speculative crypto assets, 5,000 GEN → `DENIED_CATEGORY`
-   Marketing campaign, 19,000 GEN → `ALLOWED`
-   Additional marketing, 2,000 GEN → `DENIED_CAP`
-   Related-party consulting, 1,000 GEN → `NEEDS_APPROVAL`
-   Related-party evaluation approved → accounting updated

Final tested state:

-   Total budget: **100,000 GEN**
-   Total spent: **21,000 GEN**
-   Remaining: **79,000 GEN**
-   Infrastructure: **1,000 GEN**
-   Marketing: **19,000 GEN**
-   Related party: **1,000 GEN after approval**

See `TESTING.md` for the test record.


## What this contract does not do

PolicyVault holds no funds and performs no transfers. It is an authorization and accounting ledger: it records whether a spend request is allowed, denied, or held for approval, and updates `total_spent` / `spent_by_category` only for allowed decisions. Treasury execution is performed by the external treasury holder using PolicyVault's on-chain decision as the authorization record.

The guarantee is that no spend can be recorded as `ALLOWED` unless it passes the deterministic rule engine after consensus classification: category permission, per-transaction cap, category-share cap, approval routing, and aggregate budget.

Option A from the steward request is implemented: `record_spend` has been removed. Authorized writers must use `classify_and_evaluate`, so a caller cannot self-select a category to bypass consensus classification.

## Why GenLayer

The key operations in PolicyVault are subjective:

-   interpreting policy language,
-   translating policy clauses into canonical rule semantics,
-   and classifying the economic purpose of an unstructured spend
    description.

GenLayer validator consensus handles these interpretation tasks. Once
meaning is agreed, the contract applies deterministic authorization rules and
persistent accounting.

## Architecture

``` text
Natural-Language Policy
        |
        v
GenLayer Validator Consensus
        |
        v
Canonical Rules / Version
        |
        v
Accept + Activate
        |
        v
Spend Description
        |
        v
Consensus Classification
        |
        v
Deterministic Authorization / Accounting
  |        |        |        |
ALLOW   DENY     CAP DENY   APPROVAL
        |
        v
Persistent Accounting / Audit Trail
```

## Deployment

-   Network: GenLayer StudioNet
-   Steward-fixed contract: `0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb`
-   Explorer: https://explorer-studio.genlayer.com/address/0xbEB5F2C74C2b0df15581156fd01d7dC83521CDbb
-   Previous deployment (pre-fix; do not resubmit): `0x07b79A05f6Af12d14A88E50CC4A841469aa19ecE`
-   GitHub: https://github.com/nikvn89/PolicyVault
-   Frontend: https://policy-vault-dun.vercel.app/

The frontend source in this package now defaults to the steward-fixed contract address. After pushing these files, redeploy the frontend so the live Vercel build also points to the new contract.

## Local Frontend RPC Note

During local development, direct browser requests to the StudioNet RPC
can be affected by browser CORS behavior. The tested local setup uses a
small local RPC proxy so the frontend communicates with the proxy and
the proxy forwards JSON-RPC requests to StudioNet.

Keep the RPC proxy running in a separate terminal while running the Vite
development server.

## Project Status

Steward-fixed contract redeployed on StudioNet and the steward regression flow was exercised against policy `1`. The live Vercel frontend was then reconfigured to the new contract and integration-tested successfully: it loaded the final accounting state, classified spend intent through consensus, rendered `DENIED_CATEGORY` and `DENIED_BUDGET` correctly, and left accounting unchanged for denied requests. See `TESTING.md` for the exact observed results and the finality note for Regression 5.
