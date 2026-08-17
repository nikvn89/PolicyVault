# PolicyVault

**Consensus-compiled treasury policy enforcement on GenLayer.**

## Relationship to Covenant

PolicyVault is the product-tier application of the Covenant Intelligent Contract submitted separately. The contract source is identical and deliberately unchanged; the contribution here is the treasury workflow around it — policy authoring, hash-pinned acceptance, evaluation, and the on-chain audit trail — not a new consensus mechanism.

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
rules through GenLayer validator consensus, then applies deterministic
contract logic to spending decisions, caps, approvals, and persistent
accounting.

## Problem

Treasury and grant policies are often written in natural language. Rules
such as permitted purposes, spending caps, prohibited categories, and
related-party approval requirements require interpretation before they
can be enforced.

Traditional smart contracts are good at deterministic enforcement, but
they cannot reliably interpret arbitrary natural-language spending
intent on their own.

## Solution

PolicyVault separates interpretation from enforcement:

1.  A policy is created with a fixed total budget.
2.  Natural-language policy text is compiled through GenLayer validator
    consensus.
3.  The resulting canonical version contains structured rules.
4.  The compiled hash is accepted and the version is activated.
5.  Spend requests are classified by GenLayer consensus.
6.  Deterministic contract logic applies the active rules.
7.  Allowed spending updates persistent category and total-budget
    accounting.
8.  Restricted related-party spending remains pending until explicitly
    approved.

This creates a clear boundary:

**AI interprets meaning. Deterministic state controls consequences.**

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

## Enforcement Outcomes

PolicyVault supports deterministic outcomes including:

-   `ALLOWED`
-   `DENIED_CATEGORY`
-   `DENIED_CAP`
-   `NEEDS_APPROVAL`

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

## Why GenLayer

The key operations in PolicyVault are subjective:

-   interpreting policy language,
-   translating policy clauses into canonical rule semantics,
-   and classifying the economic purpose of an unstructured spend
    description.

GenLayer validator consensus handles these interpretation tasks. Once
meaning is agreed, the contract applies deterministic enforcement and
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
Deterministic Enforcement
  |        |        |        |
ALLOW   DENY     CAP DENY   APPROVAL
        |
        v
Persistent Accounting / Audit Trail
```

## Deployment

-   Network: GenLayer StudioNet
-   Contract address: `0x07b79A05f6Af12d14A88E50CC4A841469aa19ecE`
-   GitHub: https://github.com/nikvn89/PolicyVault
-   Frontend: https://policy-vault-dun.vercel.app/

## Local Frontend RPC Note

During local development, direct browser requests to the StudioNet RPC
can be affected by browser CORS behavior. The tested local setup uses a
small local RPC proxy so the frontend communicates with the proxy and
the proxy forwards JSON-RPC requests to StudioNet.

Keep the RPC proxy running in a separate terminal while running the Vite
development server.

## Project Status

Final deployment and core functional flow tested successfully on
StudioNet.
