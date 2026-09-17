# NEXORA Roadmap — Phase 1 Decision Gate

Recorded decisions from the Phase 1 gate (no code — this is the record
the roadmap prompt asked Phase 14 to eventually fold into existing
project notes). Each blocks the phase noted.

## 1. Clear-data tool (blocks Phase 2)

**Decision:** Two separate features — per-seller reset and full-platform
reset — both using soft-delete/archive, not hard delete.

**Rationale:** No existing soft-delete convention exists for financial/
order data, and the FK cascade chain (orders → wallet_transactions →
conversations → reviews → disputes) makes hard delete risky and
irreversible. Per-seller reset stays behind regular admin access (lower
blast radius); full-platform reset is gated behind the existing
`requireSuperAdmin` middleware (same pattern already used for admin
management and subscription-plan changes) since it can affect the whole
platform's data if triggered by mistake.

## 2. Notification merge (blocks Phase 3)

**Decision:** Admin alerts fold into the personal notification bell
(`AdminNotificationBell` merges into `NotificationBell`), rather than
the personal notifications page gaining a separate shared/team section.

## 3. Admin "active users" view (blocks Phase 4)

**Decision:** Online-right-now (presence/socket-based), not a filtered
account-status list.

## 4. Map showing users (blocks Phase 5)

**Original decision:** Opt-in only (explicit permission model, not
silent), and scoped to sellers only. Buyer locations are not shown —
no clear feature need justified surfacing them, and opt-in location
data is already one of the more legally sensitive categories to
collect.

**Override (recorded at Phase 5 implementation time):** Opt-out
instead of opt-in (on by default, user can disable), and scoped to
both buyers and sellers, at precise (not approximate) coordinates.
This was flagged explicitly as a privacy/safety risk before
implementing - opt-out location sharing that includes buyers can
expose where a buyer lives or frequently is to anyone browsing the
map without them ever taking an action to share it, which is a
plausible vector for stalking/harassment and may run into
jurisdiction-specific consent requirements for precise location data.
The override was confirmed after that flag was raised. Implemented
as-is; revisit if this surfaces real-world misuse.

## 5. KYC vs accountVerification (blocks Phase 14 cleanup, informs Phase 8)

**Decision:** Merge into one flow.

**Note:** The working tree already had `frontend/src/pages/admin/
AdminVerifications.jsx` and `frontend/src/pages/seller/
SellerVerification.jsx` deleted, uncommitted, before this roadmap
started — strong signal this merge was already underway. Treat "merge"
as confirming and completing that in-progress work, not starting a new
one. Worth confirming with whoever made those deletions that this was
the intended direction.

## 6. Referral vs affiliate (blocks Phase 14 cleanup)

**Decision:** Keep both live simultaneously.

**Rationale:** They typically serve different growth channels for a
marketplace (referral = peer-to-peer/organic, affiliate = commission-
driven partners/influencers). No structural reason to sunset one absent
real usage/payout data. Revisit later with actual performance numbers
if one turns out to be non-performing.

## 7. Native apps vs PWA (blocks nothing above)

**Decision:** Existing PWA is sufficient for now. Capacitor/React
Native is backlogged, not started — a substantial separate project not
justified until the PWA is shown to be insufficient.
