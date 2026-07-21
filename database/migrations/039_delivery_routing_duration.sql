-- Migration 039: road-routing travel time on deliveries
-- Run after 038_refunds.sql.
--
-- Phase 5B (road distance & travel time) replaces the straight-line
-- distance calculation that fed distance_km (migration 033) with a real
-- road-routing call (see backend/src/services/routing/routing.service.js).
-- That same call also returns a travel-time estimate, which had nowhere
-- to be stored before now - this adds it alongside distance_km so it's
-- captured at the same moment (delivery assignment) for the same reason:
-- a permanent record of what the delivery was priced/expected against,
-- not a live-recalculated value.
--
-- estimated_duration_minutes: the road-routing travel time (in minutes)
-- from the seller pickup pin to the delivery pin, at the moment the
-- delivery was created (claim, offer-accept, or seller roster
-- assignment - see delivery.service.js / order.service.js). NULL
-- whenever the flat fallback fee was used instead (no pickup/delivery
-- pin pair to route between) - same condition under which distance_km
-- is already NULL.
--
-- routing_provider: which provider actually answered for this delivery -
-- 'osrm' (real road routing) or 'fallback' (straight-line estimate, used
-- automatically if OSRM was unreachable/timed out, or if the platform is
-- configured to use the straight-line provider directly). NULL under the
-- flat fallback fee, same as the two columns above. Purely informational
-- (transparency/debugging - "why does this delivery's ETA look off?"),
-- never read by any pricing or matching logic.
ALTER TABLE deliveries
    ADD COLUMN estimated_duration_minutes DECIMAL(6, 1) NULL AFTER distance_km,
    ADD COLUMN routing_provider ENUM('osrm', 'fallback') NULL AFTER estimated_duration_minutes;
