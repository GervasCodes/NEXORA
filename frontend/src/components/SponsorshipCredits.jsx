import { Link } from "react-router-dom";
import { formatMoney, formatDate } from "../utils/format";
import { computeFunding } from "../utils/sponsorshipCredits";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Remaining included sponsorship credits (1 credit = 1 campaign-day),
// shown on the Promote hub and on each campaign tab. `credits` is the
// `included_credits` object every campaign type's /pricing endpoint
// returns.
export function IncludedCreditsBanner({ credits }) {
    if (!credits) return null;

    if (!credits.granted) {
        return (
            <div className="rounded-lg border border-line px-4 py-3 mb-4 text-sm">
                <p className="font-medium">No included sponsorship credits</p>
                <p className="text-ash mt-0.5">
                    Paid subscription plans include monthly sponsorship credits.{" "}
                    <Link to="/seller/subscription" className="underline">See plans</Link>
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-teal/30 bg-teal/5 px-4 py-3 mb-4 text-sm">
            <p className="font-medium text-teal">
                {plural(credits.remaining, "included campaign-day")} remaining
            </p>
            <p className="text-ash mt-0.5">
                {credits.used} of {credits.granted} used this billing period
                {credits.period_end ? ` · resets ${formatDate(credits.period_end)}` : ""}.
                Credits work for product sponsorship, featured stores, and department sponsorship.
            </p>
        </div>
    );
}

// Live cost breakdown for a campaign form: how many days the seller's
// included credits cover and what's left to pay from the wallet.
export function FundingBreakdown({ pricing, days }) {
    const funding = computeFunding(pricing, days);

    return (
        <div className="space-y-1">
            {pricing.included_credits && (
                <p className="text-sm text-ash">
                    Covered by included credits: <span className="font-medium text-ink">{plural(funding.creditDays, "day")}</span>
                    {" "}({funding.remainingCredits} available)
                </p>
            )}
            <p className="text-sm">
                Total cost: <span className="price font-medium">{formatMoney(funding.totalCost)}</span>
                {funding.paidDays > 0 && funding.creditDays > 0 && (
                    <span className="text-ash"> ({plural(funding.paidDays, "paid day")} from your wallet)</span>
                )}
            </p>
            {funding.blocked && (
                <p role="alert" className="text-coral text-sm">
                    Paid sponsorship isn't available yet.
                    {funding.remainingCredits > 0
                        ? ` Choose ${plural(funding.remainingCredits, "day")} or fewer to use your included credits.`
                        : " Upgrade your subscription to get monthly included credits."}
                </p>
            )}
        </div>
    );
}
