# Escrow / Seller-Wallet Licensing Review (Phase 1)

**This is not legal advice.** It's a plain-language summary of what the
codebase actually does with buyer/seller money, mapped against publicly
available Tanzanian payment-system regulation, so a licensed advocate can
evaluate it quickly rather than starting from zero. NEXORA's target market
today is Tanzania (mobile money providers, TZS default currency, no
multi-country config found in the codebase) - this review is scoped to
that. If NEXORA expands to other countries, each one needs its own review;
the questions below (does the platform ever hold customer funds itself,
does it disburse to a third party) are the right questions everywhere, but
the answers/thresholds differ by jurisdiction.

## What the code actually does (facts, not interpretation)

1. **Order payment -> platform-side "escrow"** (`wallet.service.js`,
   `docs/ESCROW_ANALYSIS.md`, `docs/ESCROW_PAYMENT_FLOW.md`): once a
   mobile money/Snippe/PayPal webhook confirms a buyer's payment, the
   seller's net amount (after commission) is credited to a `held_balance`
   column in NEXORA's own MySQL database - not withdrawable yet. A
   scheduled job (`src/jobs/escrowRelease.job.js`) later moves it into a
   withdrawable `balance` once the order is delivered, `escrow_hold_days`
   has elapsed, and there's no open dispute. Cash-on-Delivery orders skip
   this - the seller already has the physical cash, so nothing is held.

2. **Seller payout is a manual admin action, not an automated transfer**
   (`wallet.service.js#requestWithdrawal` / `#processWithdrawal`): a
   seller requests a withdrawal, an admin approves/rejects it, and a
   separate admin action marks it "paid" once the money has actually
   moved. Nothing in this codebase calls a bank/mobile-money payout API
   automatically - the real transfer happens outside the app (an admin
   doing it manually), and the app is just the ledger + approval
   workflow recording that it happened.

3. **The `held_balance`/`balance` figures are an internal ledger, not a
   segregated account.** There's no evidence in this codebase of a
   separate trust/escrow bank account holding buyer funds 1:1 against
   these ledger balances - the numbers live in the `wallets` table like
   any other application data.

## Why this matters under Tanzanian law

Tanzania's **National Payment Systems Act, 2015** (administered by the
Bank of Tanzania) is broad: **Section 6(1) prohibits operating a payment
system or providing payment services without a BoT license**, and
"payment services" is defined broadly enough to plausibly cover an
entity that collects money from one party and pays it out to another as
part of its business - which is structurally what an escrow/wallet
marketplace does, regardless of what it's called internally.

Separately, the **Payment System (Electronic Money) Regulations, 2015**
specifically address non-bank entities that want to **hold customer
funds**: they're required to set up a **separate legal entity (a trust)**
and maintain a **trust account** for customer money, distinct from the
company's own operating funds - specifically because commingling
customer money with a company's general balance sheet is the core harm
this kind of regulation exists to prevent.

**The specific risk**: `held_balance` in NEXORA's database represents
real money that (depending on how the underlying payment providers are
configured) may already have settled into an account NEXORA controls,
sitting there for `escrow_hold_days` before being released - which is
close to the definition of "holding customer funds" the E-Money
Regulations are aimed at, even though NEXORA doesn't call itself an
e-money issuer and doesn't accumulate float across unrelated
transactions the way a wallet-top-up product would.

## Questions worth getting a definitive answer on (from a lawyer, and from MalipoPay/Selcom/AzamPay directly)

1. **Where does the money physically sit during the hold period?** If a
   buyer's mobile money payment settles into MalipoPay/Selcom/AzamPay's
   own licensed settlement account, and NEXORA's `held_balance` column is
   just a ledger entry against money the *provider* is holding (with
   NEXORA never taking custody), the licensing analysis is meaningfully
   different than if the money lands directly in an account NEXORA
   itself controls. This is worth confirming explicitly with each
   provider - some payment gateways offer a "marketplace" or "split
   payment" product precisely so the platform never touches the money
   directly, which is the common way marketplaces avoid needing their
   own PSP license.
2. **Does any of MalipoPay, Selcom, or AzamPay already hold a Bank of
   Tanzania PSP license covering this use case**, and does their
   merchant agreement with NEXORA account for the escrow/hold behavior
   (delayed release, not an ordinary immediate merchant settlement)?
   Delaying settlement to a merchant is a meaningfully different service
   than a standard "buyer pays, merchant gets paid" flow, and the
   provider's license/terms may or may not cover it.
3. **Does NEXORA (the company) need its own PSP or payment-service-related
   registration/license** given it is effectively an intermediary
   directing where money ends up (buyer -> hold -> seller, minus
   commission) even though the actual transfers ride on a licensed
   provider's rails?
4. **AML/KYC obligations**: does the platform's seller-verification flow
   (mentioned in project history as already built) satisfy whatever KYC
   standard would apply to a payment intermediary, versus just an
   e-commerce seller-identity check?
5. **Refunds/reversals** (`reverseProviderEarningsForBooking` and
   similar): reversing a wallet credit after a dispute is itself a form
   of fund movement that a regulator may want documented/auditable in a
   specific way.

## Recommendation

Before this goes live with real money (not test/simulate-provider
transactions): get a Tanzanian advocate with fintech/payments experience
to review this document plus `docs/ESCROW_ANALYSIS.md` and
`docs/ESCROW_PAYMENT_FLOW.md`, and separately raise the escrow/hold
behavior directly with MalipoPay, Selcom, and AzamPay's own compliance
teams - they will know definitively whether their existing license
covers a marketplace holding funds this way, or whether NEXORA needs a
different arrangement (e.g. a provider-side marketplace/split-payment
product, or NEXORA obtaining its own registration). This review cannot
substitute for that - it exists to make that conversation faster by
having the actual mechanics laid out up front.
