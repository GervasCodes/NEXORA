# EFD E-Invoicing — Compliance Note

Scope: `backend/src/modules/efd/*` (Phase Q4 - Tax Compliance).

## What this integration does

Per the Electronic Fiscal Devices Regulations, TRA requires registered
taxpayers to issue a fiscal receipt (with a verification code, checkable
against TRA's own systems) for taxable sales. This integration lets a
seller register their TIN (and VRN, if VAT-registered) with NEXORA; once
an admin verifies that registration, every paid order attributed to that
seller gets an invoice submitted to TRA's VFD (Virtual Fiscal Device)
service on their behalf, and the resulting fiscal receipt number/
verification code is stored against the order.

A seller who hasn't registered (or isn't verified yet) simply doesn't
get a fiscal receipt generated - their orders keep getting NEXORA's
existing, non-fiscal payment receipt only, and their `efd_receipts` rows
are marked `not_applicable` rather than treated as an error.

## What this deliberately does NOT resolve

This is engineering scaffolding for the integration, not a determination
of tax obligations. Specifically still open, and needing an actual
Tanzanian tax advisor (or direct confirmation from TRA / a TRA-certified
VFD service provider) before this handles real money and real sellers:

1. **Who is actually required to register.** TIN/VRN registration in
   this system is currently opt-in per seller - nothing here determines
   whether a given seller is *legally obligated* to issue EFD receipts
   (which depends on their turnover, VAT-registration status, and
   general TRA taxpayer obligations, none of which NEXORA independently
   verifies). Treat "seller hasn't registered" as "we don't know their
   obligation status", not as "they don't need to".
2. **TIN/VRN format and validity.** `efd.service.js`'s validation is a
   shape check (9 digits for a TIN) to catch obvious typos, not a real
   verification against TRA's taxpayer registry. A confirmed 9-digit
   number that isn't actually that seller's TIN would currently pass.
3. **The real TRA VFD API contract.** `providers/traVfd.provider.js`'s
   request/response shape is this integration's best-effort structure,
   not a confirmed API contract - TRA does not appear to publish a
   generic, self-serve developer sandbox the way payment providers
   commonly do (see `payment/providers/selcom.provider.js`'s header
   comment for the same situation on the payments side). The actual
   endpoint URL, auth scheme, and field names need to come from TRA
   directly, or from whichever TRA-certified VFD service provider ends
   up handling this integration - confirm before `TRA_VFD_BASE_URL` /
   `TRA_VFD_API_KEY` point at anything real. Until configured, this
   silently runs against `providers/simulate.provider.js` outside
   production, and refuses to start the flow at all in production (see
   `providers/efd.provider.js`'s router).
4. **Who NEXORA itself needs to be, tax-wise, for facilitating this.**
   Separate from any individual seller's own TIN/VRN, running a
   marketplace that helps merchants issue fiscal receipts may itself
   carry its own registration or reporting obligations with TRA - worth
   raising in the same advisor conversation, not assumed away by "the
   receipt carries the seller's TIN, not NEXORA's".

Nothing here should be read as legal or tax advice, and none of the
above should be treated as resolved until confirmed by someone qualified
to confirm it.
