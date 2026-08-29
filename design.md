# Personal Finance Tracker & Expense Intelligence System

## System Architecture & Technical Specification

---

## 1. Project Purpose & Executive Summary

### 1.1 The Problem

Most personal finance and budgeting applications (e.g., Monarch Money, YNAB, Copilot) suffer from key friction points:

- **High Ongoing Subscription Fees**: Costing $100–$180/year with no permanent free tiers.
- **Fragile Bank Sync APIs**: Plaid/MX integrations frequently break, require two-factor re-authentication, and introduce third-party privacy risks.
- **Rigid Category Structures**: Traditional apps force rigid single-category assignments, making it difficult to answer real-life lifestyle questions like: "How much money do I actually spend socializing (dining, drinks, rides, events) versus living solo?"
- **Tedious Manual Entry**: Complex apps take too many clicks/taps to log a simple purchase on the go.

### 1.2 The Solution

A **self-hosted, zero-subscription personal finance tracker** engineered for speed, privacy, low-friction capture, and actionable lifestyle insights.

The application uses a **central self-hosted SQLite database** rather than treating the phone as the canonical data store. The iPhone and PC are clients of the same private application, allowing data entered on the phone to immediately become available on the PC.

It combines:

1. **Historical Backfill via PDF Bank Statements**: Rapidly ingest and parse 8+ months of past TD Bank statements without manual entry.
2. **Instant Mobile Quick-Capture**: An installable mobile web app (PWA) with a minimal Name + Amount flow, instant category prediction, and a one-tap **Social (👥)** spend toggle.
3. **Desktop Analytics Dashboard**: Rich visual insights, cash-flow trends, category breakdowns, recurring subscription detection, and a dedicated **Social Spend Deep Dive**.
4. **Embedded Database**: A self-hosted SQLite database managed through Prisma ORM. No bank-sync provider, hosted database, or required external cloud account.
5. **Low-Friction Device Authorization**: The user's authorized iPhone receives a private device token that allows transaction creation without requiring a password for every expense.
6. **Public Demo / Private Data Separation**: The application may expose a read-only/demo UI publicly, but real financial data and write operations remain protected by server-side authorization.

### 1.3 Data Ownership Model

"Local" means **self-hosted and under the user's control**, not necessarily physically stored on the phone.

The canonical source of truth is:

```text
                         PRIVATE / SELF-HOSTED ENVIRONMENT

    iPhone PWA                              PC Dashboard
         │                                      │
         │ quick capture                        │ analytics / admin
         ▼                                      ▼
              ┌─────────────────────────────────┐
              │       Finance Web Application   │
              │          API + Auth             │
              └────────────────┬────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   SQLite: finance.db │
                    │  Canonical data store│
                    └──────────────────────┘
```

The phone does **not** need to own the database. It only needs network access to the self-hosted application.

---

## 2. Core Goals & Key Requirements

| Domain | Requirement | Technical Objective |
| :--- | :--- | :--- |
| **Historical Data** | Ingest 8+ months of past statements | Parse TD Bank PDF statements into structured transaction rows with validation and duplicate detection. |
| **Mobile Capture** | Frictionless logging on the go | PWA requires only **Name + Amount**, with instant category prediction and one-tap **Social** toggle. |
| **Category Prediction** | Real-time prediction with no perceptible lag | Local/in-memory 3-tier cascade: Historical Merchant Lookup → Built-in Keyword Engine → User Rules. Optimize for instant UX rather than an arbitrary latency target. |
| **Social Tagging** | Multi-dimensional lifestyle tracking | Orthogonal `isSocial` boolean applicable to any category. |
| **Analytics & Insights** | Comprehensive desktop view | Month-over-month cash flow trends, category breakdowns, top merchants, recurring subscription detection, and social spending analytics. |
| **Data Layer** | Zero external accounts & free forever | Self-hosted SQLite + Prisma ORM. No required cloud database or bank aggregation service. |
| **Authentication** | Low-friction personal access | Device-token authorization for the iPhone; password-protected dashboard/admin access. |
| **Privacy** | Prevent unauthorized access | Real data and write APIs require server-side authorization. Public/demo UI must never provide access to real financial records. |
| **Backups** | Prevent catastrophic data loss | Automated versioned backups plus an explicit export/restore mechanism. Backups should be encrypted when stored outside the primary machine. |
| **Offline Capture** | Resilient mobile entry | Prefer an offline-capable PWA so a temporary network outage does not prevent expense capture. |

---

## 3. Security & Authentication Architecture

### 3.1 Security Philosophy

This is a personal application, not a multi-tenant SaaS platform. The security model should therefore be **simple, strong, and low-friction** rather than unnecessarily complex.

The most important rule is:

> **The UI is never the security boundary. The server/API must enforce every permission.**

Hiding the "Add Record" button is useful for UX, but it must never be the mechanism that prevents unauthorized writes.

### 3.2 Access Modes

The application has three conceptual modes:

#### A. Public / Demo Mode

Anyone who can access the public website may:

- View the application UI.
- Navigate through the interface.
- Interact with charts and controls.
- Use a demo logging interface.

However:

- Demo data must be separate from real data.
- Changes made in demo mode are not persisted to the real database.
- Public users cannot read real transactions.
- Public users cannot create, modify, or delete real transactions.

#### B. Authorized iPhone Mode

The user's iPhone is registered with a randomly generated **device token**.

The device token allows:

- Reading the minimum data required by the mobile UI.
- Creating new transactions.
- Optionally viewing recent transactions.

It does **not** automatically grant administrative privileges.

The normal logging flow should therefore be:

```text
Open PWA
    ↓
Enter merchant/name
    ↓
Enter amount
    ↓
Category predicted
    ↓
Optional Social toggle
    ↓
Save
```

No password should be required for each transaction.

#### C. Authenticated PC / Admin Mode

The desktop dashboard is protected by a normal password login.

After authentication, the PC can access:

- Full transaction history.
- Editing.
- Deletion.
- Statement import.
- Category rules.
- Analytics.
- Backup/restore controls.
- Device authorization management.

A session should persist for a reasonable period so the password is not repeatedly requested during normal use.

---

## 4. Device Token Authentication

### 4.1 Why Device Tokens

A device token provides the desired balance:

- Much less friction than a password.
- Simple to implement.
- Specific to an authorized device.
- Revocable if the phone is lost.
- Independent of the device's model/IMEI/Apple ID.

The application should **not** attempt to identify an iPhone solely from its browser or device characteristics. Browser/device fingerprints are not reliable security credentials.

### 4.2 Registration Flow

The initial iPhone authorization should happen from the authenticated PC/admin interface.

Example:

```text
PC Dashboard
    ↓
Settings → Authorized Devices
    ↓
Generate iPhone Device Token
    ↓
Display one-time enrollment code / link
    ↓
Open enrollment on iPhone
    ↓
Confirm authorization
    ↓
Store device token on iPhone
```

The exact enrollment UX can be simplified for the MVP, but the important property is that **only an already-authorized admin can create a write-capable device credential**.

### 4.3 Device Token Storage

The token should:

- Be cryptographically random and sufficiently long.
- Be stored securely on the client where practical.
- Never be committed to GitHub.
- Never be embedded into publicly served JavaScript.
- Be revocable from the PC dashboard.
- Be stored server-side as a secure hash where practical, rather than storing the raw token unnecessarily.

Conceptually:

```text
iPhone
  │
  │ Device Token
  ▼
API
  │
  ├── Valid token? ── No ──→ 401 Unauthorized
  │
  └── Yes
       ↓
   Check permission
       ↓
   Create transaction
```

### 4.4 Device Permissions

Device authorization should be explicit.

Suggested permissions:

```text
iPhone:
  READ_RECENT_TRANSACTIONS
  CREATE_TRANSACTION

PC/Admin:
  READ_ALL
  CREATE
  UPDATE
  DELETE
  IMPORT
  MANAGE_RULES
  MANAGE_DEVICES
  BACKUP
  RESTORE
```

The iPhone should not receive unnecessary administrative capabilities.

### 4.5 Revocation

The PC dashboard should provide:

```text
Settings
  → Authorized Devices
      → iPhone
          → Revoke
```

If the phone is lost, the device token can be immediately invalidated.

---

## 5. Network Exposure & Privacy

### 5.1 Default Principle

The finance application should **not be intentionally exposed directly to the public internet** unless there is a clear reason to do so.

Preferred access:

```text
iPhone / PC
      ↓
Private network or secure private tunnel
      ↓
Finance application
      ↓
SQLite
```

Avoid:

```text
Internet
   ↓
Publicly exposed finance server
   ↓
SQLite
```

If remote access is needed, use a secure private networking solution rather than simply opening a database/API port to the internet.

### 5.2 Public GitHub Repository

The source code may be public.

The repository must never contain:

- `finance.db`
- Real bank statements
- Real transaction data
- Passwords
- Device tokens
- Session secrets
- API keys
- Production certificates
- Other deployment secrets

Use environment variables for deployment secrets and provide an `.env.example` containing placeholders only.

Example:

```text
.env
.env.local
finance.db
backups/
statements/
```

should be excluded from version control as appropriate.

### 5.3 Public Demo Safety

If the application is deployed publicly for demonstration:

- The public site uses demo data only.
- The production database is not exposed to anonymous reads.
- Anonymous users cannot call write endpoints successfully.
- Demo-mode writes are discarded or stored in an isolated demo database.
- Real API credentials are never shipped to the browser.

---

## 6. Data Architecture

The data pipeline should separate **raw imported information**, **canonical financial records**, and **derived intelligence**.

```text
TD Bank PDF
     ↓
RAW IMPORT
     ↓
Validation / normalization
     ↓
Duplicate detection
     ↓
User review
     ↓
CANONICAL TRANSACTIONS
     ↓
Derived categorization / analytics
```

### 6.1 Raw Import Layer

Keep enough information about an import to trace where it came from.

Potential fields:

```text
Import
- id
- sourceFilename
- sourceAccount
- importedAt
- statementPeriod
- parserVersion
```

Potential raw transaction fields:

```text
ImportedTransaction
- id
- importId
- date
- merchantRaw
- amountRaw
- transactionTypeRaw
- sourcePage
- parsedConfidence
- normalizedData
- status
```

### 6.2 Canonical Transaction Layer

The canonical `Transaction` table represents the application's trusted financial record.

Suggested conceptual fields:

```text
Transaction
- id
- date
- merchant
- amount
- type
- categoryId
- isSocial
- notes
- source
- createdAt
- updatedAt
```

The exact schema should be finalized during implementation.

### 6.3 Derived Intelligence

Categorization predictions, recurring subscription detection, aggregates, and other analytics should be treated as derived information wherever practical.

This makes it possible to change the intelligence layer without corrupting the underlying financial records.

---

## 7. Historical Data Import

### 7.1 PDF Import Pipeline

The PDF importer should **not** directly write parsed rows into the canonical transaction table.

Use:

```text
PDF
 ↓
Parser
 ↓
Imported Transactions
 ↓
Validation
 ↓
Duplicate Detection
 ↓
Review
 ↓
Commit
```

### 7.2 Import Review

Before committing an import, show:

- Number of transactions detected.
- Number of transactions successfully parsed.
- Potential duplicates.
- Rows requiring manual review.
- Total deposits/withdrawals detected.
- Statement period.

Example:

```text
183 transactions found

179 ready to import
4 require review
12 potential duplicates

[Review] [Import Valid Transactions]
```

Financial data should never be silently trusted when the parser is uncertain.

### 7.3 Duplicate Detection

Use a combination of:

1. Exact duplicate detection.
2. Probable duplicate detection.

A normalized transaction fingerprint can be based on:

```text
account
date
amount
normalized merchant
transaction type
```

A second transaction with the same merchant, amount, and date should not automatically be deleted because legitimate duplicate purchases are possible.

Instead, uncertain matches should be surfaced for review.

---

## 8. Mobile Quick Capture

The primary mobile interaction should remain extremely small:

```text
Name
[ Starbucks ]

Amount
[ $7.42 ]

Category
[ Coffee ]

[ 👥 Social ]

[ Save ]
```

The goal is **minimal friction**, not maximum configurability.

### 8.1 Category Prediction

Use a 3-tier cascade:

```text
1. Historical Merchant Lookup
          ↓
2. Built-in Keyword Engine
          ↓
3. User Rules
```

The system should optimize for **perceptually instant** feedback rather than requiring an arbitrary `<5ms` benchmark.

### 8.2 Learning From Corrections

When the user manually changes a predicted category, the application should have the option to learn that merchant/category relationship for future transactions.

Example:

```text
"Costco"
  → Predicted: Groceries
  → User changes: Household
  → Future Costco transactions prefer Household
```

The learning mechanism should be deterministic and explainable rather than opaque.

---

## 9. Social Tagging

`isSocial` is an independent dimension rather than a category.

Example:

```text
Restaurant
  category = Dining
  isSocial = true
```

versus:

```text
Restaurant
  category = Dining
  isSocial = false
```

This enables analytics such as:

- Total dining spend.
- Total social spend.
- Social dining.
- Social transportation.
- Social entertainment.
- Percentage of dining spend that is social.
- Top merchants for social spending.

This should remain separate from the category hierarchy.

---

## 10. Analytics & Insights

The desktop dashboard should provide:

### Core Analytics

- Monthly spending.
- Month-over-month changes.
- Income vs. expenses.
- Cash-flow trends.
- Category breakdowns.
- Top merchants.
- Transaction history.

### Recurring Spending

Detect likely:

- Subscriptions.
- Recurring bills.
- Repeated merchants.
- Regular payment patterns.

These should be presented as **detections**, not treated as guaranteed truth.

### Social Spend Deep Dive

Provide:

- Total social spending.
- Social spending by month.
- Social spending by category.
- Social vs. non-social comparison.
- Top social merchants.
- Social spending as a percentage of total spending.

---

## 11. Offline-First Mobile Behavior

The PWA should preferably support temporary offline use.

If the phone has no network connection:

```text
User enters expense
       ↓
Saved locally as pending
       ↓
Network returns
       ↓
Sync with server
       ↓
Server confirms transaction
```

Pending transactions should have an explicit status so they are not accidentally submitted twice.

The server remains the canonical source of truth.

---

## 12. Backups & Disaster Recovery

Because `finance.db` is the canonical financial record, backups are a core requirement rather than an optional feature.

### 12.1 Backup Requirements

Provide:

- Automatic periodic backups.
- Versioned backups.
- Manual "Create Backup" action.
- Manual export.
- Restore functionality.
- Backup validation where practical.

Example:

```text
finance.db
    ↓
Daily backup
    ↓
backups/
  finance-2026-08-27.db
  finance-2026-08-28.db
  finance-2026-08-29.db
```

### 12.2 Backup Security

Backups containing real financial data should be encrypted when stored outside the primary trusted machine.

Do not automatically synchronize an unencrypted `finance.db` to a generic cloud drive.

The backup strategy should prioritize:

> **Recoverability without sacrificing privacy.**

---

## 13. Transaction History & Auditability

Important financial records should not be silently overwritten without a trace.

At minimum, the application should record:

- `createdAt`
- `updatedAt`

For more robust history, introduce transaction revisions or an audit log.

This is especially useful when changing categorization rules or performing bulk edits.

A future audit layer could record:

```text
Transaction changed
  old category: Dining
  new category: Entertainment
  changedAt: ...
  reason/source: User
```

This protects against accidental bulk modifications and makes the system easier to debug.

---

## 14. Recommended MVP Architecture

### Phase 1 — Data Foundation

```text
SQLite
 ↓
Prisma schema
 ↓
Canonical transactions
 ↓
Manual transaction CRUD
```

### Phase 2 — Historical Import

```text
TD PDF
 ↓
Parser
 ↓
Raw import staging
 ↓
Validation
 ↓
Duplicate detection
 ↓
Review
 ↓
Canonical transactions
```

### Phase 3 — Mobile Capture

```text
PWA
 ↓
Name + Amount
 ↓
Category prediction
 ↓
Social toggle
 ↓
Device-token authorization
 ↓
Save
```

### Phase 4 — Intelligence

```text
Historical merchant lookup
 ↓
Keyword engine
 ↓
User rules
 ↓
Learning from corrections
```

### Phase 5 — Dashboard

```text
Transactions
Categories
Merchants
Cash flow
Recurring spending
Social analytics
```

### Phase 6 — Reliability & Security

```text
Backups
Restore
Device management
Audit history
Offline sync
Private network access
```

---

## 15. Final Architectural Principles

The project should follow these principles:

1. **One canonical database** — SQLite is the source of truth.
2. **Self-hosted, not phone-hosted** — the database lives on the user's trusted server/machine, while the phone and PC act as clients.
3. **Privacy by default** — real financial data is never public.
4. **Server-side authorization** — UI visibility is never treated as security.
5. **Low-friction capture** — expense logging should not require a password every time.
6. **Device-token authorization** — the iPhone gets a revocable write credential.
7. **Password-protected administration** — sensitive management operations require authenticated access.
8. **Public demo is isolated** — visitors can explore the UI without reaching real data.
9. **Raw → canonical → derived** — imported source data, trusted transactions, and intelligence remain conceptually separate.
10. **Human review for uncertain imports** — financial data should not be silently committed when parsing is ambiguous.
11. **Offline-capable mobile capture** — temporary connectivity problems should not prevent logging.
12. **Backups are mandatory** — the database must be recoverable.
13. **No secrets in GitHub** — source code can be public; credentials and financial data cannot.
14. **Optimize for user experience** — "instant" matters more than arbitrary microsecond/millisecond targets.
15. **Keep the system simple** — this is a single-user personal finance application, not a multi-tenant enterprise platform.

---

## 16. High-Level System Diagram

```text
                         ┌─────────────────────────┐
                         │       PUBLIC USERS      │
                         │                         │
                         │    Demo / Read-Only     │
                         └────────────┬────────────┘
                                      │
                                      │ demo only
                                      ▼
┌────────────────┐          ┌─────────────────────────┐
│    iPhone      │          │    Finance Web App     │
│                │          │                         │
│ PWA            │─────────▶│ API + Authorization     │
│ Device Token   │          │                         │
│ Quick Capture  │          └────────────┬────────────┘
└────────────────┘                       │
                                         │
┌────────────────┐                       │
│      PC        │                       │
│                │───────────────────────┤
│ Password Login │                       │
│ Dashboard      │                       │
│ Import         │                       │
│ Admin          │                       │
└────────────────┘                       │
                                         ▼
                              ┌─────────────────────┐
                              │ SQLite: finance.db │
                              │                     │
                              │ Canonical Records  │
                              └──────────┬──────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │ Encrypted / Versioned│
                              │ Backups             │
                              └─────────────────────┘

          Separate historical import path:

TD Bank PDF
     │
     ▼
PDF Parser
     │
     ▼
Import Staging
     │
     ▼
Validation + Duplicate Detection
     │
     ▼
User Review
     │
     ▼
SQLite / Canonical Transactions
```

---

## 17. Definition of Done

The MVP is complete when:

- [ ] 8+ months of TD Bank statements can be imported.
- [ ] Imported transactions are reviewed before being committed.
- [ ] Duplicate transactions are detected.
- [ ] Transactions have categories.
- [ ] `isSocial` can be independently toggled.
- [ ] Mobile PWA can create a transaction in a few seconds.
- [ ] iPhone can create transactions without repeatedly entering a password.
- [ ] iPhone authorization uses a revocable device token.
- [ ] PC dashboard requires authentication for real data.
- [ ] Public visitors can explore a demo without accessing real data.
- [ ] Server-side API authorization prevents unauthorized writes.
- [ ] SQLite remains the canonical source of truth.
- [ ] Backups can be created and restored.
- [ ] No financial data or secrets are committed to GitHub.
- [ ] The application can be accessed from the iPhone and PC without duplicating databases.
- [ ] Temporary network loss does not cause accidental duplicate transactions.
