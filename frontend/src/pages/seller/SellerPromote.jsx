import { useSearchParams } from "react-router-dom";
import PageMeta from "../../components/PageMeta";
import SellerSponsorship from "./SellerSponsorship";
import SellerFeaturedStore from "./SellerFeaturedStore";
import SellerDepartmentSponsorship from "./SellerDepartmentSponsorship";

// Phase 3 (Remediation, A3): sponsorship, featured stores, and
// department sponsorship used to be three separate nav entries/routes
// that did the same thing (pay from wallet balance to buy a period of
// extra visibility somewhere on the site) with three near-identical
// pages. This consolidates them into one "Promote" entry point with a
// tab per campaign type. Backend modules, routes (each still calls its
// own /seller/{sponsorship|featured-store|department-sponsorship}/*
// endpoints), and data models are untouched - each tab renders the
// existing page component as-is (via its new `embedded` prop, which
// just skips that page's own <PageMeta>/<h1> since this hub supplies
// one), so none of the three campaign types' logic changed at all.
const TABS = [
    { key: "sponsorship", label: "Sponsored products", Component: SellerSponsorship },
    { key: "featured-store", label: "Featured stores", Component: SellerFeaturedStore },
    { key: "department-sponsorship", label: "Department sponsorship", Component: SellerDepartmentSponsorship }
];

export default function SellerPromote() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const activeTab = TABS.find((tab) => tab.key === requestedTab) || TABS[0];

    return (
        <div>
            <PageMeta title="Promote" noIndex />
            <h1 className="font-display text-2xl mb-1">Promote</h1>
            <p className="text-ash text-sm mb-6">
                Pay from your wallet balance for extra visibility - a sponsored
                product slot, top billing for your store, or a boosted
                department on the homepage.
            </p>

            <div className="flex flex-wrap gap-1 mb-8" role="tablist" aria-label="Promotion type">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={activeTab.key === tab.key}
                        onClick={() => setSearchParams(tab.key === TABS[0].key ? {} : { tab: tab.key })}
                        className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                            activeTab.key === tab.key ? "bg-ink text-paper" : "text-ash hover:bg-line/50"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <activeTab.Component embedded />
        </div>
    );
}
