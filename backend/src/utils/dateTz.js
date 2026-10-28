// Phase 2: date maths in the marketplace's own time zone. The server may run
// in UTC; `new Date().toISOString().slice(0, 10)` then returns the UTC date,
// which is the *previous* day in East Africa for the first three hours after
// midnight. These helpers always work in Africa/Dar_es_Salaam (UTC+3, no DST).
const DEFAULT_TZ = "Africa/Dar_es_Salaam";

// "YYYY-MM-DD" for `now` as seen in `tz`.
const todayInTz = (now = new Date(), tz = DEFAULT_TZ) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

// "YYYY-MM-DD" that is `days` calendar days after today in `tz`.
const addDaysInTz = (days, now = new Date(), tz = DEFAULT_TZ) => {
    const [y, m, d] = todayInTz(now, tz).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + Number(days))).toISOString().slice(0, 10);
};

module.exports = { DEFAULT_TZ, todayInTz, addDaysInTz };
