import StatusBadge from "./ui/StatusBadge";

// Thin wrapper over the shared StatusBadge (Phase 4 remediation) - kept
// as its own component so the existing `<BookingStatusBadge status={} />`
// call sites (Bookings.jsx, BookingDetail.jsx, SellerBookings.jsx) don't
// all need to change to `domain="booking"` at every usage. The style/
// icon/translation table itself now lives in utils/statusMeta.jsx,
// shared with order/dispute/return/group-buy statuses instead of being
// its own standalone copy.
export default function BookingStatusBadge({ status, size = "md" }) {
    return <StatusBadge domain="booking" status={status} size={size} />;
}
