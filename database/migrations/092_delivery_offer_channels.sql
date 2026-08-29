-- Migration 092: WhatsApp/SMS offer-accept channel tracking.
--
-- Roadmap Phase 1 (WhatsApp/SMS as an Offer-Accept Channel).
--
-- `external_channel` records whether a pickup offer was ALSO pushed out
-- over WhatsApp or SMS (in addition to the always-sent in-app socket
-- event + web push) - NULL means only the in-app channels were used
-- (e.g. neither integration is configured in this deployment). Set once,
-- at offer-creation time, by delivery.service.js#offerToNextCandidate.
--
-- `response_channel` records how the agent actually responded - a tap
-- in the app ('app', the default/existing behavior), or a text reply
-- received over WhatsApp/SMS and routed into the same acceptOffer/
-- declineOffer functions. Set once, when the offer is accepted/declined.
-- Both columns are purely informational (admin dispatch visibility) and
-- never read back into matching/ranking logic.
ALTER TABLE delivery_offers
    ADD COLUMN external_channel ENUM('whatsapp', 'sms') NULL AFTER distance_km,
    ADD COLUMN response_channel ENUM('app', 'whatsapp', 'sms') NULL AFTER responded_at;
