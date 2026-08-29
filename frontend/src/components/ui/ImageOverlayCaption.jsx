// Gradient scrim + bottom-anchored title/subtitle, for a cover image
// inside a `relative overflow-hidden` container (department covers,
// service-category covers). Extracted (UI/UX Overlap Remediation, Phase 6)
// from markup duplicated between DepartmentCard.jsx and
// ServiceCategoryCard.jsx - the title always gets `truncate` here by
// default, closing off the class of bug fixed one-off in Phase 1
// (DepartmentCard's title was missing it while ServiceCategoryCard's
// wasn't).
//
// Renders as a fragment - the caller places it as the last child inside
// its own `relative` image wrapper, after the <img>/gradient/badges.
export default function ImageOverlayCaption({ title, subtitle }) {
    return (
        <>
            <div className="absolute inset-0 bg-gradient-to-t from-abyss/70 via-abyss/0 to-abyss/0" />
            <div className="absolute bottom-3 left-3 right-3">
                <h3 className="font-display text-lg text-frost leading-tight mb-0.5 truncate">{title}</h3>
                {subtitle && <p className="text-frost/75 text-xs">{subtitle}</p>}
            </div>
        </>
    );
}
