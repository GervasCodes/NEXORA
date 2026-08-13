# NEXORA — UI/UX & Platform Polish Remediation, Phase P1b: Input Retrofit (partial)

## Status: in progress, not complete — this zip is a checkpoint, not a final delivery

P1 built the shared `Input.jsx` component and deferred its retrofit. This
phase is that retrofit: replacing the duplicated `border border-line
rounded-md px-3 py-2 text-sm ...` classNames with `<Input>`, and fixing
fields missing `focus-ring` along the way. **19 of ~50 files with matching
input/textarea markup have been converted so far.** The remaining files are
listed below so the next pass can pick up exactly where this one stopped.

## Files converted this pass

**Components:**
- `components/DeliveryAgentRating.jsx` — comment textarea
- `components/ProductFilters.jsx` — min/max price filter inputs
- `components/ServiceFilters.jsx` — min/max price filter inputs
- `components/ai/NexoraCopyAssist.jsx` — audience + key-points inputs

**Pages:**
- `pages/Account.jsx` — name/email/verification-code/password fields (6)
- `pages/BookingDetail.jsx` — review comment textarea
- `pages/Checkout.jsx` — street address, city, region
- `pages/DisputeDetail.jsx` — refund amount, resolution note, reject reason,
  discussion reply (4 fields)
- `pages/ForgotPassword.jsx` — email, verification code, new password
- `pages/Login.jsx` — email, password, OTP code
- `pages/NewDispute.jsx` — subject, details
- `pages/ProductDetail.jsx` — review comment textarea
- `pages/Register.jsx` — first/last name, email, password, plate number
- `pages/admin/AdminSettings.jsx` — all 8 standalone settings fields
  (commission rate, rider fee, per-km rate, verification fee, USD rate,
  sponsorship/featured-store/department-sponsorship daily rates)

## Focus-ring bugs found and fixed along the way

The retrofit surfaced more of the "missing `focus-ring`" bugs than the ~23
P1 estimated in the files touched so far — most of them in places a plain
classname grep for the *exact* duplicated string wouldn't have caught,
because these fields use `focus:outline-none` or bare `outline-none`
instead of just omitting the ring entirely:

| File | Field(s) | Fix |
|---|---|---|
| `ProductFilters.jsx` | min/max price | `focus:outline-none focus:border-ink` → `<Input>` (always applies `focus-ring`) |
| `ServiceFilters.jsx` | min/max price | same |
| `components/ai/NexoraAIDrawer.jsx` | chat message input | `outline-none` → `focus-ring` (see exceptions below — kept as raw input) |
| `components/ai/NexoraSmartSearch.jsx` | smart-search pill | same |
| `components/chat/MessageSearch.jsx` | conversation search | same |
| `pages/admin/AdminSettings.jsx` | **all 8 standalone fields**, plus the 2 inline distance-band inputs | had no focus styling at all (`className` didn't even include `focus:` anything) — likely the biggest single concentration of the bug in the app |

**This means the true count of focus-inaccessible fields is higher than
P1's 23-field estimate**, and the remaining unconverted files (see below)
haven't been checked yet — worth re-running the audit once the retrofit is
complete, rather than trusting the original count.

## Structural exceptions — left as raw `<input>`, same reasoning as P1's SearchBox

`Input`'s wrapper div is always `w-full` (see `Input.jsx`) so it stays
correctly stacked under a `label`. That makes it a poor fit for inputs
that are fused into a single-row flex layout alongside a button, icon, or
select — forcing `w-full` there either breaks the row's flex sizing or
requires guessing at a wrapper override the component doesn't expose. Where
that was the case, I fixed only the accessibility bug (added `focus-ring`
where it was missing) and left the field as a raw `<input>`:

- `components/PhoneInput.jsx` — national-number field fused to the country-code `<select>`
- `components/SearchBox.jsx` — search field fused to the voice-search button (same as P1's search-submit exception)
- `components/ai/NexoraAIDrawer.jsx` — chat pill input fused to Send
- `components/ai/NexoraSmartSearch.jsx` — pill input fused to submit
- `components/chat/MessageSearch.jsx` — pill input fused to Close
- `pages/admin/AdminAuditLogs.jsx` — search + two date inputs, all in a `flex-wrap` filter row
- `pages/admin/AdminBillingControl.jsx` — scheduled datetime input, fused to Schedule button
- `pages/admin/AdminSettings.jsx` — the 2 inline distance-band inputs (compact stepper pair with a Remove button)
- `pages/Cart.jsx` (not yet touched, but flagged) — quantity stepper fused to Remove
- `pages/ConversationThread.jsx` (not yet touched) — message input fused to Send
- `pages/Messages.jsx` (not yet touched) — search input with inline icon overlay
- `pages/ServiceCategoryPage.jsx`, `pages/ServiceDetail.jsx` (not yet touched) — search-with-button and guest-count stepper

This is the same "structurally-attached, would break on `Button`/`Input`'s
own sizing" call P1 made for `SearchBox.jsx`'s submit button — documented
rather than silently skipped, same as that precedent. If this pattern
keeps recurring (it has, a lot), it may be worth giving `Input` an optional
`wrapperClassName` prop in a later phase so these don't all have to stay
exceptions.

## Not yet started — remaining files with matching input/textarea markup

**Admin:**
`AdminCategories.jsx`, `AdminMaintenance.jsx`, `AdminManageAdmins.jsx`,
`AdminProducts.jsx`, `AdminServiceCategories.jsx`, `AdminServices.jsx`,
`AdminStatusIncidents.jsx`, `AdminStoreTypes.jsx`, `AdminVerifications.jsx`,
`AdminWithdrawals.jsx`, `AdminAccountVerifications.jsx`,
`AdminSubscriptions.jsx` (mostly file/checkbox/number inputs — needs a look)

**Seller (entirely untouched):**
`SellerAvailability.jsx`, `SellerCollections.jsx`, `SellerDeliveryTeam.jsx`,
`SellerDepartmentSponsorship.jsx`, `SellerFeaturedStore.jsx`,
`SellerPricing.jsx`, `SellerProductForm.jsx`, `SellerProducts.jsx`,
`SellerReviews.jsx`, `SellerServiceForm.jsx`, `SellerServiceReviews.jsx`,
`SellerSetup.jsx`, `SellerSponsorship.jsx`, `SellerStore.jsx`,
`SellerVerification.jsx`, `SellerWallet.jsx`

**Other pages:**
`Cart.jsx`, `ConversationThread.jsx`, `Messages.jsx`,
`ServiceCategoryPage.jsx`, `ServiceDetail.jsx` (all flagged above as likely
structural exceptions, but not yet confirmed/fixed for focus-ring)

The seller product/service forms (`SellerProductForm.jsx`,
`SellerServiceForm.jsx`) in particular looked, from the earlier grep pass,
like the largest remaining block of straightforward standalone
labeled-field conversions — probably the best place to start the next
pass.

## What this zip contains

Only the 19 files listed above under "Files converted this pass" — every
other file in the repo is unchanged from P1. `components/ui/Input.jsx`
itself is unchanged (it already existed from P1); it's not included here.

## Testing

**Not run.** Per instruction, tests are being run manually this pass —
skipped here deliberately, not an oversight. Before merging: `npx vitest
run` and `npx eslint src --ext .js,.jsx` on at least the 19 touched files,
plus a manual pass over `AdminSettings.jsx` specifically since every field
on that page changed markup (labels moved from a separate `<label>` element
into `Input`'s `label` prop, and hint paragraphs into its `hint` prop —
worth confirming nothing relies on the old DOM structure, e.g. a test
querying by a specific `<p>` hint element).

## Manual steps required

None. Same as P1 — pure frontend markup, no env/migration changes.
