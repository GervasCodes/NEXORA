import { useLocationSharing } from "../hooks/useLocationSharing";

// Mounted once near the root (App.jsx) alongside the other always-on,
// no-UI listeners (DepartmentMaintenanceListener). Phase 5 (map showing
// users) - the hook itself decides whether it's actually eligible to do
// anything (role, the account's own opt-out toggle, socket connection),
// so this component just needs to exist somewhere that's always
// mounted for a logged-in session.
export default function LocationSharingListener() {
    useLocationSharing();
    return null;
}
