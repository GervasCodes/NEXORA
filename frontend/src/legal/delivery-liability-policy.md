*Effective date: 18 July 2026 · Version 1.0*

> **Template notice:** This document is a starting-point template. Have it reviewed by
> qualified counsel, particularly the specific time windows and any statutory delivery
> obligations in your operating jurisdiction(s).

## 1. Purpose

This policy is the authoritative reference for **who is responsible when something goes
wrong in transit** — damaged items and delayed deliveries specifically — and how that
maps to the resolutions available through NEXORA's dispute process. It works alongside
the Terms of Service, Vendor Agreement, and Insurance Policy.

## 2. The three points of custody

Every order passes through up to three points of custody, and liability for a given
problem generally follows whoever had custody when it happened:

1. **Seller custody** — from packing until handoff to the Delivery Agent.
2. **Delivery Agent custody** — from handoff until the order is marked delivered/handed
   to the Buyer.
3. **Buyer custody** — from confirmed delivery onward.

## 3. Damaged items — attribution rules

| Evidence shows | Responsible party | Typical resolution |
|---|---|---|
| Item was damaged/defective on packing, or packaging was clearly inadequate for the product (e.g. no padding for fragile goods) | **Seller** | Full refund, partial refund, or replacement, funded from the Seller's wallet. |
| Item was intact at handoff (per Seller's own listing/packing photos, where provided) and damaged in transit | **Delivery Agent** (and, where the agent is part of the Seller's own Delivery Team, the Seller as the party who engaged them — see Vendor Agreement §5) | Refund funded per Section 6 below; NEXORA may separately recover the cost from the Delivery Agent's earnings for that delivery, per the Delivery Agent's own agreement with the Seller. |
| Damage occurred after the order was marked delivered | **Buyer**, unless there's clear evidence the item was already compromised at delivery (e.g. a delivery-time photo showing damage) | Generally not eligible for refund; Buyers should inspect on arrival and report immediately. |
| Cause can't be determined from available evidence | Reviewed case-by-case by an admin, weighing packaging quality, photos, and delivery notes | Admin discretion — may split responsibility with a partial refund. |

A dispute filed as `damaged` should be opened with photo evidence as soon as possible
after delivery — evidence quality is the main input into which row above applies.

## 4. Delayed deliveries — attribution rules

- **Delivery estimates shown at checkout are estimates, not guarantees.** Traffic,
  weather, address issues, and courier availability can all affect actual delivery
  time.
- **Late handoff** — if a Seller hands the order to the courier well after the
  timeframe implied by the checkout estimate, and that late handoff is the direct
  cause of the delay, responsibility sits with the **Seller**.
- **Late transit** — once an order is in an Agent's custody, delays caused by route,
  availability, or the Agent's own scheduling are the **Delivery Agent's**
  responsibility.
- **Force majeure** — delays caused by events outside anyone's reasonable control
  (severe weather, road closures, civil disruption, national holidays affecting
  courier availability) are not attributed to any party; NEXORA may still offer
  goodwill compensation at its discretion.
- Delays alone (without a failed or damaged delivery) are typically resolved with an
  updated ETA and, at admin discretion, partial compensation — not a full refund —
  unless the delay is severe enough that the Buyer no longer wants the order, in which
  case a full refund may be appropriate if the order hasn't yet been delivered.

## 5. Missing and non-delivered orders

If tracking shows an order was never delivered, or the Buyer never received it despite
a "delivered" status, this is treated as the Delivery Agent's responsibility unless
evidence shows the Buyer provided an incorrect or inaccessible address, in which case
responsibility shifts to the Buyer for a re-delivery fee.

## 6. Who actually funds the refund

Regardless of fault attribution above, NEXORA administers refunds through the same
mechanism for consistency:

- Refunds are settled by reversing the **Seller's** wallet earnings for the affected
  order amount — this is the same ledger used for withdrawals (`wallet_transactions`,
  reference type `dispute`).
- Where fault is attributed to a **Delivery Agent** rather than the Seller, the Seller
  is refunded/made whole through the Delivery Agent's own compensation or wallet
  arrangement with that Seller (Delivery Agents engaged directly by a Seller are
  compensated by that Seller, not by NEXORA) — this is a matter between the Seller and
  their Delivery Agent, informed by NEXORA's fault attribution on the dispute record.
  NEXORA's dispute resolution and audit trail (`dispute_history`) exists specifically
  to give both parties clear evidence for that internal settlement.
- The Buyer-side refund of money already paid (returning funds via mobile money,
  PayPal, or another gateway) is **not fully automated across every payment provider
  today** — an admin may need to trigger that manually. Buyers should expect this to
  take longer than the in-app dispute resolution itself.

## 7. Evidence and time windows

- Buyers should report damaged, defective, or missing items **as soon as possible**,
  and in any case within the window shown in the app for the relevant order (default:
  a limited number of days after the delivery date, configurable by NEXORA).
- Sellers and Delivery Agents may respond with their own evidence (packing photos,
  handoff confirmation, delivery-time photos) through the same dispute thread.
- Disputes are decided on the balance of the evidence actually provided — the absence
  of packing or handoff photos from a Seller, or delivery-confirmation photos from a
  Delivery Agent, works against that party when fault is ambiguous.

## 8. Relationship to insurance

Some losses under this policy may be recoverable under NEXORA's own insurance
arrangements or a Seller's/Delivery Agent's own coverage — see the
**[Insurance Policy](/legal/insurance-policy)** for what's covered, by whom, and how to
make a claim.

## 9. Changes to this policy

We may update this policy as the Platform evolves. Material changes will be flagged in
the Platform with a new effective date above.
