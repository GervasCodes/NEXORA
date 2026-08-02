-- Migration 072: webhook_replay_guard table.
--
-- Phase 2 (Security Hardening).
--
-- docs/WEBHOOK_VALIDATION.md #6 and docs/SECURITY_REVIEW_CHECKLIST.md #2
-- both flagged the same known gap: MalipoPay/Selcom/Snippe webhook
-- verification (signature or shared-secret) proves a request came from
-- the provider, but nothing stops a captured, validly-signed request
-- from being replayed later - the secret/signature isn't bound to a
-- single delivery. This was mitigated in practice by the existing
-- `payment.status === 'completed' || 'failed'` idempotency short-circuit
-- (a replay of an already-processed payment is a no-op), but that's a
-- side-effect of unrelated code, not an explicit anti-replay control -
-- see PHASE2_SECURITY_CHANGELOG.md for the fix built on this table.
--
-- One row per webhook delivery actually accepted (signature/secret
-- already verified) - `payload_hash` is SHA-256(provider + raw body),
-- so a byte-for-byte replay of ANY provider's webhook collides on the
-- same hash and is rejected by the UNIQUE constraint, regardless of
-- whether that provider's payload happens to include its own
-- timestamp/nonce field. This is intentionally provider-shape-agnostic.
CREATE TABLE IF NOT EXISTS webhook_replay_guard (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_provider_payload_hash (provider, payload_hash),
    KEY idx_received_at (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
