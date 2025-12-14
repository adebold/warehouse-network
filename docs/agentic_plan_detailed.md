# Agentic Execution Plan (Detailed)

This document provides a detailed, phase-by-phase plan for building the Warehouse Management Platform. It is designed to be executed by an AI agent, ensuring alignment with the PRD.

---

## Phase 1: Foundation (90% Complete)

This phase establishes the project's technical foundation.

- **[x] Project Scaffolding**: Monorepo with `pnpm`, `apps/web`, and `packages/*`.
- **[x] Database Setup**: Prisma initialized with PostgreSQL. Initial schema for core entities created.
- **[x] Web Application Setup**: Next.js (App Router) initialized in `apps/web`.
- **[x] Operator Application Flow**: Public form for new operators to apply.
- **[x] Platform Admin Review Flow**: Internal page for admins to approve/reject applications.
- **[x] Authentication & RBAC**: NextAuth.js with Prisma adapter and Credentials provider. Basic page protection implemented.
- **[x] Authentication & RBAC**: NextAuth.js with Prisma adapter and Credentials provider. Basic page protection implemented.
- **[x] Input Validation Setup**:
    - `[x]` Integrate `zod` into the project.
    - `[x]` Create Zod schemas for all existing API inputs.
    - `[x]` Enforce schema validation in API handlers.

---

## Phase 2: Operator Onboarding & Setup (Completed)

This phase focuses on the complete onboarding experience for an approved warehouse operator.

### 2.1 Operator Account Finalization (Section 9.3.3)

- **[x] Accept Operator Terms & Conditions**
- **[x] Configure Company Profile**
- **[x] Invite Internal Users**

### 2.2 Warehouse & Pricing Setup (Sections 9.3.4, 9.3.5)

- **[x] Warehouse Registration**
- **[x] Warehouse Pricing Configuration**

### 2.3 Stripe Integration (Connect Onboarding)

- **[x] Setup Stripe Connect**

---

## Phase 3: Core Warehouse Operations (MVP)

This phase implements the primary day-to-day functionalities of the warehouse.

### 3.1 Receiving & Skid Management (Sections 4.4, 4.5) (Completed)

- **[x] Receiving Orders**
- **[x] Skid Generation & Labeling**

### 3.2 Staff Mobile App (PWA) (Section 4.0) (In Progress)

- **[x] UI/UX**: Mobile-first UI for staff workflows.
- **[x] QR Code Scanning**: Integrated `@yudiel/react-qr-scanner`.
- **[x] Core Scan Flows**:
    - `[ ]` **Receive**: Scan an inbound order, assign skid IDs, and set status to `RECEIVED`.
    - `[x]` **Putaway/Move**: Scan a skid, scan a location, confirm the move.
    - `[ ]` **Pick/Release**: Scan a release ticket, scan skids, and update status.
- **[x] Audit Trail**:
    - `[x]` **Schema**: Create an `AuditEvent` model.
    - `[x]` **Logic**: Ensure every scan action creates an immutable audit event.

### 3.3 Customer-Facing Portal (Sections 4.6, 4.7)

- **[ ] Customer Inventory View**:
    - `[ ]` **UI**: Create a page for customers to view their skids (`/app/inventory`).
    - `[ ]` **API**: Create a secure, tenant-isolated API to fetch a customer's inventory.
- **[ ] Pickup & Release Requests**:
    - `[ ]` **Schema**: Create `ReleaseRequest` model.
    - `[ ]` **UI**: Create a form for customers to request a pickup (`/app/releases/new`).
    - `[ ]` **API**: Create endpoints for submitting and managing release requests.
    - `[ ]` **Operator UI**: Add a page for operators to view and approve release requests.

---

## Phase 4: Billing, Payments & Quotes

This phase focuses on the financial aspects of the platform. **Note:** All Stripe integrations will be designed to use Stripe's Multi-Currency Processing (MCP) servers. This requires storing currency information alongside any monetary values.

- **[ ] Daily Accrual Engine (Section 4.6)**:
    - `[ ]` **Logic**: Implement the accrual logic in `/packages/core`.
    - `[ ]` **Background Job**: Create a daily cron job to run the accrual engine. The job must be idempotent and auditable.
    - `[ ]` **Schema**: Create `ChargeLine` (with `amount` and `currency`) and `JobRun` models.
- **[ ] RFQ & Quoting (Sections 4.1, 4.2, 4.3)**:
    - `[ ]` **Schema**: Create `Quote` and `RFQ` models (with `currency`).
    - `[ ]` **Customer UI**: Build the RFQ submission form.
    - `[ ]` **Admin UI**: Build the Quote Builder for super admins.
    - `[ ]` **Customer UI**: Build the Quote Review & Acceptance page.
- **[ ] Deposits & Payments (Stripe)**:
    - `[ ]` **Integration**: Use Stripe Checkout for deposit payments, specifying the currency.
    - `[ ]` **API**: Create endpoints to generate checkout sessions.
    - `[ ]` **Webhooks**: Handle payment success webhooks from Stripe.
    - `[ ]` **Schema**: Add a `Deposit` model (with `amount` and `currency`).
- **[ ] Payouts to Operators (Section 9.5)**:
    - `[ ]` **Ledger**: Implement an immutable ledger system (`OperatorLedgerEntry`, with `amount` and `currency`).
    - `[ ]` **Logic**: Calculate operator payouts based on charges and the platform's take rate, handling potential currency conversions.
    - `[ ]` **Background Job**: Create a job to process payouts on a schedule.
    - `[ ]` **Stripe**: Use the Stripe API to send payouts to connected accounts in their preferred currency.
- **[ ] Multi-Currency Schema Update**:
    - `[ ]` **Schema**: Add `currency` (String) field to `PricingRule`, `Quote`, `ChargeLine`, `Deposit`, and `Payout` models.

---

## Phase 5: Marketplace & Growth Features

This phase focuses on expanding the platform into a true marketplace.

- **[ ] SEO Engine (Section 21)**:
    - `[ ]` **UI**: Create templates for programmatic city and region landing pages.
    - `[ ]` **Logic**: Implement the logic to auto-generate and update these pages as new warehouses are added.
    - `[ ]` **Sitemap**: Generate a dynamic sitemap.
- **[ ] Discovery & Matching (Sections 9.7, 13)**:
    - `[ ]` **UI**: Add search and filtering capabilities to the main website.
    - `[ ]` **Logic**: Implement the matching heuristics.
- **[ ] Advanced Features**:
    - `[ ]` Referral Engine (Section 22)
    - `[ ]` Trust & Quality Scoring (Section 16)
    - `[ ]` Dispute Management (Section 17)

This detailed plan will now serve as our roadmap. I am ready to begin with the first to-do item in Phase 1: **Input Validation Setup**.
