-- Migration 064: Nexora Services — Phase 3 (Financial Integration)
-- Depends on: bookings, booking_items (063), payments (007/019/027/028/030),
-- seller_wallets, wallet_transactions (017), escrow held_balance (054)
--
-- Covers the three items CHANGES.md's own roadmap lists under Phase 3:
-- Escrow Integration, Payouts, Commission Management. Per CHANGES.md's
-- own "Payment Architecture" section ("Reuse the existing Nexora payment
-- infrastructure" — Wallet / Escrow / Earnings / Commission Engine all
-- listed as "Existing Components"), this migration does NOT introduce a
-- second payment/wallet/commission system for bookings — it widens the
-- product-side tables just enough for a booking to flow through the
-- exact same tables an order already does. Payouts specifically need
-- zero schema changes at all: seller_wallets/withdrawal_requests are
-- already keyed on `seller_id INT REFERENCES users(id)`, and
-- bookings.provider_id is that same users.id (see 062's design notes on
-- provider_id following products.seller_id's convention) — a provider
-- withdrawing their booking earnings is already the exact same
-- wallet.service.js#requestWithdrawal flow a product seller uses, no
-- new table or column required for that part.
--
-- Design notes:
--  - payments.booking_id (nullable, mirroring how 019 made order_id
--    nullable for verification-fee payments) plus a third `purpose`
--    value, 'booking_payment', is how a booking payment reuses `payments`
--    exactly like a verification fee does — NOT the order_id-based flow.
--    Deliberately: an order's payment_method is decided once at checkout
--    and stored on `orders.payment_method` before any payment.service.js
--    call happens; a booking has no such column (see 063's design notes —
--    bookings mirrors orders' shape only where a date-range booking
--    allows), so which gateway a buyer pays with is only known at the
--    moment they call one of the initiate*BookingPayment endpoints —
--    exactly the same "no predetermined method" shape
--    initiateVerificationFeePayment already has. That's why
--    booking-payment functions in payment.service.js are new siblings of
--    the verification-fee functions, not the order ones.
--  - No CHECK constraint tying booking_id/order_id/seller_id to `purpose`
--    — the existing 019 migration didn't add one for order_id/seller_id
--    either, relying on payment.repository.js's own insert functions to
--    only ever set the pair that matches the purpose they're for. This
--    migration follows that same established convention rather than
--    introducing a stricter pattern only for the new column.
--  - booking_items gets the exact same four columns 017 added to
--    order_items (commission_rate/commission_amount/wallet_credited) plus
--    054's wallet_released, renamed seller_net_amount ->
--    provider_net_amount to match this domain's own vocabulary
--    (provider_id, not seller_id, on bookings/services) while remaining
--    byte-for-byte the same mechanism: a snapshot of the commission
--    actually applied, taken the moment a booking's payment is confirmed,
--    guarding double-crediting exactly like order_items.wallet_credited
--    already does. Per-booking_items-row (not one total on `bookings`)
--    for the same reason order_items carries these columns instead of
--    `orders`: a booking already has one row per date
--    (service_date/quantity/subtotal) for exactly the same reason a
--    multi-line order needs per-item commission math, and the same
--    composite (wallet_credited, wallet_released) index 054 added for
--    order_items' escrow-release scan is what Phase 3's booking release
--    scan needs too.
--  - wallet_transactions.reference_type gains one new value, 'booking',
--    for the ledger row written the moment a booking's payment is
--    confirmed and its provider's earnings are held (mirrors 'order').
--    The RELEASE-side ledger row (held -> available) keeps reusing the
--    existing 'escrow_release' value unchanged — a wallet_transactions
--    row is a generic "money moved" record read by
--    wallet.service.js#getWalletSummary for a provider/seller's own
--    transaction history, never joined back against `orders` or
--    `bookings` by type, so one shared release-side value for both order
--    and booking releases is consistent with how escrow release already
--    worked before this migration, not a new convention.
--  - No changes to disputes/refunds. CHANGES.md's Phase 3 scope is
--    explicitly Escrow Integration / Payouts / Commission Management —
--    disputes are order_id-shaped (034) and extending them to bookings
--    is a bigger, separate schema decision this phase doesn't make.
--    A paid booking that's cancelled instead reverses escrow directly
--    (see wallet.service.js#reverseProviderEarningsForBooking) and
--    attempts an online refund the same way refund.service.js's
--    callProvider already does for a dispute-triggered order refund —
--    just invoked directly from the booking cancellation path instead
--    of through the disputes table, since there's no dispute row to
--    hang it off of. See booking.service.js for that flow.
--  - No new `platform_settings` row: commission_rate and escrow_hold_days
--    (017, 054) are already generic "the platform's current rate/window"
--    values, not order-specific ones — settings.service.js#getCommissionRate
--    and #getEscrowHoldDays are called as-is for booking earnings too,
--    exactly the "Reuse Existing Infrastructure" principle CHANGES.md's
--    own Requirements section asks for. This is Commission Management's
--    entire Phase 3 database footprint: none, because the mechanism
--    already existed and already applies uniformly to whichever
--    domain hands it a subtotal.

-- 1. Booking payments reuse `payments` -------------------------------------
ALTER TABLE payments
    ADD COLUMN booking_id INT NULL AFTER order_id,
    MODIFY purpose ENUM('order_payment', 'seller_verification_fee', 'booking_payment')
        NOT NULL DEFAULT 'order_payment';

ALTER TABLE payments
    ADD CONSTRAINT fk_payments_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE CASCADE;

CREATE INDEX idx_payments_booking ON payments (booking_id);

-- 2. Commission + escrow snapshot on booking_items --------------------------
ALTER TABLE booking_items
    ADD COLUMN commission_rate DECIMAL(5, 2) NULL AFTER subtotal,
    ADD COLUMN commission_amount DECIMAL(12, 2) NULL AFTER commission_rate,
    ADD COLUMN provider_net_amount DECIMAL(12, 2) NULL AFTER commission_amount,
    ADD COLUMN wallet_credited BOOLEAN NOT NULL DEFAULT FALSE AFTER provider_net_amount,
    ADD COLUMN wallet_released BOOLEAN NOT NULL DEFAULT FALSE AFTER wallet_credited;

CREATE INDEX idx_booking_items_escrow_release
    ON booking_items (wallet_credited, wallet_released);

-- 3. Ledger reference type ---------------------------------------------------
ALTER TABLE wallet_transactions
    MODIFY reference_type ENUM('order', 'withdrawal', 'adjustment', 'dispute', 'escrow_release', 'booking')
        NOT NULL;
