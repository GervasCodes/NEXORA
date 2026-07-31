# Escrow & Payment Flow Diagrams

Phase 3 (External Review Readiness) deliverable. These diagrams show how
money actually moves through NEXORA today, as implemented in
`payment.service.js`, `wallet.service.js`, `dispute.service.js`, and the
`escrowRelease` job — cross-checked against the code, not aspirational.
They're meant to give an external reviewer (security/architecture audit)
a correct mental model without having to trace the call graph by hand.

Diagrams are [Mermaid](https://mermaid.js.org/), which renders natively
on GitHub. See `docs/ESCROW_ANALYSIS.md` for the original design
rationale (Phase 9A) — this document is the "what actually ships" picture
for 9B–9D plus the Services (booking) equivalent, not a re-derivation of
that design.

## 1. Order payment → seller payout (escrow) lifecycle

```mermaid
sequenceDiagram
    participant Buyer
    participant Frontend
    participant API as NEXORA API
    participant Provider as Payment Provider<br/>(MalipoPay / Selcom / Snippe / PayPal)
    participant Wallet as seller_wallets
    participant Job as escrowRelease job

    Buyer->>Frontend: Checkout order
    Frontend->>API: POST /payments/orders/:id/(provider)
    API->>Provider: Create charge / checkout session
    Provider-->>Buyer: Redirect / USSD prompt to pay
    Buyer->>Provider: Completes payment on provider's UI

    Provider->>API: Webhook (server-to-server)<br/>POST /payments/webhooks/:provider
    Note over API: Signature / shared-secret verified<br/>(see WEBHOOK_VALIDATION.md)
    API->>API: payment.status = completed<br/>order.payment_status = paid
    API->>Wallet: creditSellersForOrder()<br/>writes to held_balance (NOT balance)
    API-->>Buyer: payment:updated (Socket.IO)

    Note over Wallet: Seller sees held_balance,<br/>cannot withdraw it yet

    loop Delivery happens
        Buyer->>API: Confirms delivery receipt
    end

    Job->>Wallet: releaseEligibleEarnings()<br/>(scheduled sweep)
    Note over Job: Releases held → available only if:<br/>1) order delivered, AND<br/>2) escrow_hold_days elapsed, AND<br/>3) no open dispute on the item
    Job->>Wallet: held_balance -= amount<br/>balance += amount
    Wallet-->>API: order_items.wallet_released = TRUE
```

**Key invariant:** a seller's `balance` (withdrawable) is only ever
increased by the release job — never directly by the webhook handler.
This is what closes the gap described in `docs/ESCROW_ANALYSIS.md` §2
(sellers withdrawing before a dispute window closes).

## 2. Cash on Delivery (no escrow hold)

```mermaid
flowchart TD
    A[Order placed, COD selected] --> B[Delivery agent delivers]
    B --> C[Buyer confirms receipt<br/>confirmDeliveryReceipt]
    C --> D[order.status = delivered]
    D --> E[creditSellersForOrder]
    E --> F["seller_wallets.balance += amount<br/>(direct, no hold)"]
    F -.->|"Rationale"| G["Seller already holds the cash in person.<br/>The platform never custodied these funds,<br/>so there is nothing to place in escrow —<br/>see ESCROW_ANALYSIS.md §3.2"]
```

## 3. Dispute opened before release

```mermaid
flowchart TD
    A[Order paid, held_balance credited] --> B{Dispute opened<br/>before hold period elapses?}
    B -- No --> C[escrowRelease job releases<br/>held_balance to balance normally]
    B -- Yes --> D[Job sees open dispute on order_item<br/>→ skips release, item stays held]
    D --> E{Admin resolves dispute}
    E -- Rejected --> F[Dispute closed<br/>→ release resumes on original schedule]
    E -- Refund approved --> G[reverseSellerEarnings:<br/>held_balance -= refunded amount]
    G --> H["No clawback needed from `balance` —<br/>funds were never released to it.<br/>(Strictly safer than the pre-escrow<br/>behavior in ESCROW_ANALYSIS.md §1 step 5)"]
```

## 4. Booking (Services) payment — same escrow model, single provider

```mermaid
sequenceDiagram
    participant Customer
    participant API as NEXORA API
    participant Provider as Payment Provider
    participant Wallet as seller_wallets

    Customer->>API: Initiate booking payment<br/>(mobile money / Snippe / PayPal)
    API->>Provider: Create charge, reference = "BOOKING-{id}"
    Provider->>API: Webhook confirms payment
    API->>API: booking payment.status = completed
    API->>Wallet: creditProvidersForBooking()<br/>→ held_balance (always escrowed —<br/>no COD-equivalent path for services)
    Note over Wallet: Same release job (escrowRelease.job.js)<br/>sweeps booking_items on the same tick<br/>as order_items, using booking-specific<br/>delivery/hold-period logic
```

## 5. Webhook idempotency (all providers)

```mermaid
flowchart LR
    A[Webhook received] --> B{payment.status already<br/>'completed' or 'failed'?}
    B -- Yes --> C["Return { alreadyProcessed: true }<br/>No state change, no double wallet credit"]
    B -- No --> D[Process normally:<br/>mark payment, update order,<br/>credit wallet]
```

This matters because every provider in this integration (MalipoPay,
Selcom, Snippe, PayPal capture callbacks) can legitimately redeliver the
same webhook (network retry, provider-side retry-storm on a slow
response, etc.). The idempotency check in
`_handleOrderPaymentWebhook`/`_handleBookingPaymentWebhook` is what
prevents a redelivered webhook from crediting a seller's wallet twice —
this is called out explicitly here because it's a correctness property
an external reviewer should be able to verify against the code
(`payment.service.js`), not something visible from the API surface alone.

## Reviewer notes / scope

- These diagrams describe **money movement and state transitions**, not
  the full HTTP contract — see `docs/API.md` for endpoints and
  `docs/WEBHOOK_VALIDATION.md` for how each webhook is authenticated.
- No behavior shown here changed as part of Phase 3 — this phase adds
  documentation only, so these diagrams are a description of Phases
  1–9(D)'s shipped behavior, not new functionality.
