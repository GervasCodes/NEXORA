-- Migration 063: Nexora Services — Phase 2 (Booking Infrastructure)
-- Depends on: services, service_categories (062), users (001)
--
-- Covers the three items CHANGES.md's own roadmap lists under Phase 2:
-- Availability Engine, Booking Engine, Booking Lifecycle. Escrow/payout
-- wiring (provider_payouts) is deliberately left for the Phase 3
-- migration (Financial Integration) — same phase split the Phase 1
-- migration (062) already established.
--
-- Design notes:
--  - service_availability.available_units / price / status map straight
--    onto CHANGES.md's Availability entity (id, serviceId, date,
--    availableUnits, price, status). `price` is nullable: NULL means
--    "use the service's base_price for this date," matching how a
--    provider would only ever override specific dates (a holiday
--    surcharge, a discounted midweek night) rather than re-entering a
--    price for every single day up front.
--  - UNIQUE(service_id, date): a service has at most one availability
--    row per date, so "how many units are open on 2026-08-01" is always
--    a single-row lookup, never an aggregation.
--  - bookings intentionally mirrors orders' shape (006) as closely as a
--    date-range, per-service booking allows: booking_reference plays
--    order_number's role, payment_status is the same plain
--    unpaid/paid enum orders use (escrow's held_balance concept lives on
--    the wallet side, not this column — orders never added extra
--    payment_status values for escrow either, per docs/DATABASE.md).
--    `status` uses CHANGES.md's own Booking Lifecycle verbatim (pending
--    -> confirmed -> active -> completed, with cancelled/refunded as
--    exits) rather than orders' shipping-oriented status enum, since a
--    booking's lifecycle is genuinely different from a physical order's.
--  - bookings.service_id / provider_id have no ON DELETE CASCADE, same
--    reasoning products.sql already documents for order_items.product_id
--    (hard-deleting would orphan booking/payment history) — and neither
--    services nor seller_profiles ever get hard-deleted in this codebase
--    to begin with (soft-delete via is_active/status only), so this
--    just keeps that same guarantee.
--  - provider_id is a snapshot of services.provider_id at booking time,
--    exactly like order_items.seller_id snapshots products.seller_id -
--    a provider's own bookings list should never depend on joining
--    through a service row that could theoretically change owners.
--  - booking_items is the one real design decision CHANGES.md leaves
--    implicit: its Booking entity already carries serviceId/quantity
--    directly (unlike an order, which has no product info until you
--    join order_items), so booking_items isn't "line items in a cart"
--    the way order_items is. What it captures instead is CHANGES.md's
--    own Availability Engine example - "20 rooms available" per date -
--    applied across a date range: a 3-night hotel stay needs 3 separate
--    availability checks/decrements (one per night, since each night's
--    available_units and price can differ), not one. Each row is one
--    date within [start_date, end_date) of a booking, holding that
--    date's quantity/unit_price/subtotal - which is also exactly what
--    the backend will read service_availability against, one date at a
--    time, when confirming a booking. A single-date booking (a tour, a
--    meeting room for one day) simply gets exactly one booking_items
--    row.
--  - booking_items.booking_id CASCADEs on delete (unlike bookings’ own
--    FKs above) for the same reason order_items cascades from orders:
--    the line items are only ever meaningful attached to their parent,
--    and a booking itself is never hard-deleted independent of its
--    items.

-- 1. Availability Engine --------------------------------------------------
CREATE TABLE IF NOT EXISTS service_availability (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,

    date DATE NOT NULL,
    available_units INT NOT NULL DEFAULT 1,
    price DECIMAL(12, 2) NULL,
    status ENUM('open', 'closed') NOT NULL DEFAULT 'open',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_service_availability_service
        FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_service_availability_date (service_id, date)
);

CREATE INDEX idx_service_availability_date ON service_availability (date);

-- 2. Booking Engine ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_reference VARCHAR(30) NOT NULL UNIQUE,

    service_id INT NOT NULL,
    provider_id INT NOT NULL,
    customer_id INT NOT NULL,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    amount DECIMAL(12, 2) NOT NULL,

    -- Booking Lifecycle, per CHANGES.md verbatim.
    status ENUM('pending', 'confirmed', 'active', 'completed', 'cancelled', 'refunded')
        NOT NULL DEFAULT 'pending',
    payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_bookings_service
        FOREIGN KEY (service_id) REFERENCES services(id),

    CONSTRAINT fk_bookings_provider
        FOREIGN KEY (provider_id) REFERENCES users(id),

    CONSTRAINT fk_bookings_customer
        FOREIGN KEY (customer_id) REFERENCES users(id)
);

CREATE INDEX idx_bookings_customer ON bookings (customer_id);
CREATE INDEX idx_bookings_provider_status ON bookings (provider_id, status);
CREATE INDEX idx_bookings_service_dates ON bookings (service_id, start_date, end_date);

-- 3. Booking line items (one row per date in the booking's range) --------
CREATE TABLE IF NOT EXISTS booking_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,

    service_date DATE NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_booking_items_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_booking_items_date (booking_id, service_date)
);
