# Mobile QA checklist - 360px and 390px (Home, Product detail, Checkout)

**Status: NOT YET VERIFIED.** This file was written from reading the code, not from looking at the pages on a phone
or an emulator. Every box below is empty on purpose. Tick a box only after you have seen it with your own eyes,
and write what you saw in "Notes". Items under "Why check" are risks spotted in the code, not confirmed bugs.

## How to run it
- Widths: **360 x 800** (small Android) and **390 x 844** (iPhone 12-14). Check each in portrait.
- Real devices first (Android Chrome, iOS Safari). Browser dev-tools device mode is acceptable as a second pass but
  does not show the iOS home-indicator inset, the on-screen keyboard or real touch scrolling.
- Run every row in **English and Kiswahili** (Swahili strings are often longer) and signed out, then as a buyer.
- Throttle to "Fast 3G" once per page to see loading states, and go offline once to see the error states.
- Record: device / browser / language / pass-fail / screenshot link.

Legend: 360 = result at 360px, 390 = result at 390px. Leave blank until tested.

## 1. Home (`/`)

| # | Check | Why check | 360 | 390 |
|---|---|---|---|---|
| H1 | Headline and the main call-to-action are visible without scrolling | Hero is a single column below `lg`; 3D hero may load late | | |
| H2 | No horizontal scrollbar on the page (swipe sideways: page must not move) | Rails and grids sit inside `max-w` containers | | |
| H3 | Product grid is 2 columns; titles, prices and badges are not clipped or overlapping | `grid-cols-2 gap-4` leaves ~150px per card at 360 | | |
| H4 | Horizontal rails (recently viewed, recommended) scroll smoothly and the last card is fully reachable | | | |
| H5 | Floating action buttons (bottom-right) do not cover a CTA, price or the cookie/consent banner | `FloatingActions` is fixed at `bottom-[calc(1rem+var(--bottom-inset))]` | | |
| H6 | Install prompt / update banner do not stack on top of each other or hide the page's main action | Both are fixed above the bottom edge | | |
| H7 | Header: menu opens, language switch works, cart count readable, tap targets about 44px | | | |
| H8 | Tap each text link/button once: no mis-taps on neighbours (cards, wishlist heart, add-to-cart) | | | |
| H9 | Reduced-motion on (OS setting): hero and rails do not animate aggressively | | | |
| H10 | Kiswahili: no truncated section titles or buttons | | | |

## 2. Product detail (`/products/:slug`)

| # | Check | Why check | 360 | 390 |
|---|---|---|---|---|
| P1 | Photo gallery: swipe between photos, dots/arrows usable, tap opens the lightbox and it can be closed | Gallery uses custom swipe handling | | |
| P2 | Title, price, discount price and stock message fit without clipping | | | |
| P3 | Variant options (size/colour buttons) wrap onto new lines instead of overflowing | Option buttons are laid out in a flex row | | |
| P4 | Sticky buy bar: price and "Add to cart" are both fully visible and not cut by the screen edge or iOS home indicator | Bar uses `bottom-[var(--bottom-inset)]` | | |
| P5 | Sticky buy bar does not cover the last section of the page (scroll to the very bottom) | A `h-20` spacer is added for it | | |
| P6 | Sticky buy bar does not collide with the floating action buttons or the consent banner | Both are fixed to the bottom | | |
| P7 | Signed out: the button reads as a login prompt and returns to this product after sign-in | `returnTo` + `intent=add-to-cart` | | |
| P8 | Sold-out / low-stock: button disabled state is obvious | | | |
| P9 | Reviews, questions and "more from this store" rows scroll without trapping the page scroll | | | |
| P10 | Share / save controls reachable with one thumb | | | |
| P11 | Kiswahili: the add-to-cart label fits on one line next to the price | Swahili labels are longer | | |

## 3. Checkout (`/checkout`)

| # | Check | Why check | 360 | 390 |
|---|---|---|---|---|
| C1 | Step indicator (Delivery / Payment / Review) fits on one line | | | |
| C2 | Home delivery / Pickup toggle buttons are both fully visible | | | |
| C3 | City and Region sit side by side (2 columns): text and autofill suggestions are readable | `grid-cols-2` leaves ~165px each | | |
| C4 | Landmark field: label, hint and placeholder are readable; required asterisk shows only for a typed address | Phase 7 | | |
| C5 | Phone: country-code select and number field fit on one row; typing a number is not blocked by the keyboard | Select is `w-28` | | |
| C6 | Location prompt card: both buttons are visible and tappable; "No thanks" removes it | Phase 7 | | |
| C7 | "Use my current location": permission prompt appears once; allow -> pin, address filled, confirm box shown | Phase 7, needs HTTPS | | |
| C8 | Block location permission, then tap the button: the plain-language message appears under the map | Phase 7 | | |
| C9 | Map (260px tall): you can still scroll the page with a finger that starts on the map; dragging the pin moves the pin | Touch gestures on embedded maps | | |
| C10 | Drag the pin: address refreshes and the "confirm" tick resets | Phase 7 | | |
| C11 | Saved default address: preselected, no address inputs shown, moving the pin does not overwrite it | Phase 7 | | |
| C12 | Press "Place order" empty: a message under each missing field, focus and scroll land on the first one, and it is not hidden behind the sticky bar or header | Phase 6 scrolls the field to the centre | | |
| C13 | Open the on-screen keyboard in the last fields: the field being typed in stays visible above the sticky bar | Sticky order bar is fixed | | |
| C14 | Payment method rows: name, hint and card logos do not overflow | Logos are on the right of each row | | |
| C15 | Terms checkbox and its three links are tappable without hitting the wrong link | Three links in one sentence | | |
| C16 | Sticky bottom bar: total and "Place order" visible, not under the iOS home indicator; last form content not hidden | Form has `pb-28` | | |
| C17 | Order summary below the form is readable; coupon field and Apply button fit | | | |
| C18 | After a successful order the confirmation page opens, and Back does not return to checkout | Phase 5 | | |
| C19 | Kiswahili: every error message and label is complete and does not break the layout | Phase 6/7 strings | | |

## 4. Pages that got a sticky bottom bar in Phase 8 (spot check)

| # | Check | 360 | 390 |
|---|---|---|---|
| S1 | Store page `/stores/:slug`: "Shop this store" bar shows on a phone, is hidden for the store's owner, and opens the store feed | | |
| S2 | Group buy `/group-buys/:id` (open): price + "Join" bar shows; signed out sends you to sign-in and back; hidden after joining | | |
| S3 | Group buy (successful, signed-in buyer): "Claim your price" opens the claim form and scrolls to it | | |
| S4 | `/sell` signed out: "Create a seller account" bar shows; hidden when signed in | | |
| S5 | On all three: the bar is not shown on a tablet/desktop width (768px and up) and never hides the last paragraph/button | | |
| S6 | On all three: the bar does not collide with the floating action buttons or consent banner | | |

## Known gap noted while writing this (not changed in Phase 8)
- The `/sell` page's call-to-action goes to `/register`, whose role defaults to Buyer; the seller role must be picked
  by hand on the form. Worth deciding whether the link should preselect the seller role.
