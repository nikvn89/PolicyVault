# PolicyVault --- Testing

## Test Environment

-   Network: GenLayer StudioNet
-   Contract: `0x352800986bdb0DFb9311b97eB9F6332357205822`
-   Policy ID: `1`
-   Compiled Version ID: `1`
-   Total Budget: `100000 GEN`

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
