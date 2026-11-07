// PLACEHOLDER figures, not logistics data. Replace with real delivery times
// per region before launch. Keys are region names as stored on products.
const DAYS_BY_REGION = {
    "Dar es Salaam": { min: 1, max: 2 },
    "Arusha": { min: 2, max: 4 },
    "Dodoma": { min: 2, max: 4 },
    "Mwanza": { min: 3, max: 5 },
};
const DEFAULT_DAYS = { min: 3, max: 6 };

export function deliveryEstimate(region) {
    return DAYS_BY_REGION[region] || DEFAULT_DAYS;
}
