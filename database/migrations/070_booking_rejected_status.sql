-- Migration 070: Add 'rejected' to bookings.status.
--
-- Merchant-Type-Aware Dashboard, Phase 5 (Booking Status Review).
--
-- Today a provider declining a still-pending booking request goes
-- through booking.service.js#cancelBooking - the same path a customer
-- uses to change their mind - so both end up as 'cancelled'. That
-- conflates two different events (buyer backed out vs. provider turned
-- the request down), which matters for a provider's dashboard: a
-- service-heavy seller needs to see their own decline rate separately
-- from buyer-initiated cancellations, and a buyer benefits from a
-- clearer "the provider declined this" message instead of an ambiguous
-- "cancelled".
--
-- 'rejected' is added as a new terminal status reachable only from
-- 'pending', via a new provider-only reject action (see
-- booking.service.js#rejectBooking). It does NOT touch the payment
-- flow: a pending booking that was already paid still exits through
-- 'refunded' exactly as before (booking.repository.js#cancelBooking's
-- finalStatus parameter already supported swapping in a different
-- status for this reason - reused as-is here). Every existing status
-- ('pending', 'confirmed', 'active', 'completed', 'cancelled',
-- 'refunded') is kept, so no other transition changes.
ALTER TABLE bookings
    MODIFY COLUMN status ENUM('pending', 'confirmed', 'active', 'completed', 'cancelled', 'refunded', 'rejected')
    NOT NULL DEFAULT 'pending';
