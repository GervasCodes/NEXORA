-- Migration 112: extend the `is_test` / clear-data scope to bookings
-- Run after 111_broadcast_delivery_events.sql.
--
-- Background: 104_test_data_flag.sql scoped the clear-data tooling to
-- orders, reviews, chats, disputes, returns and wallet ledgers - the
-- product side of the platform. Nexora Services' bookings (063) were
-- never folded in, so a per-seller or platform reset left every
-- provider's booking history (and its cascaded booking_items, booking
-- payments and booking-keyed reviews) untouched. This is Phase 6's
-- "also clear bookings" ask.
--
-- Only the root `bookings` row gets the flag, same convention 104 used:
-- booking_items, the booking's `payments` row and any booking-keyed
-- `reviews` row all cascade from bookings.id (ON DELETE CASCADE, see
-- 063/064/066), so flagging them separately would only create a second
-- place for the two to disagree. service_availability is deliberately
-- left out - it's a provider's standing calendar/capacity data, not a
-- transactional record tied to any one booking.
--
-- Default FALSE, same reasoning as 104: every booking that already
-- exists is treated as real data unless deliberately marked otherwise.

ALTER TABLE bookings
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER payment_status;

CREATE INDEX idx_bookings_is_test ON bookings(is_test);
