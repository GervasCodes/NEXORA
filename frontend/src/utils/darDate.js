// Calendar days in Africa/Dar_es_Salaam (UTC+3, no daylight saving). Reports and date pickers
// must use these instead of `new Date().toISOString().slice(0, 10)`, which is the UTC date -
// the previous day for the first three hours after local midnight.
const TZ = "Africa/Dar_es_Salaam";

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

// "YYYY-MM-DD" for `now` as seen in Dar es Salaam.
export const todayDar = (now = new Date()) => fmt.format(now);

// "YYYY-MM-DD" that is `days` calendar days before today in Dar es Salaam.
export const daysAgoDar = (days, now = new Date()) => {
    const [y, m, d] = todayDar(now).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - Number(days))).toISOString().slice(0, 10);
};

export const DAR_TZ = TZ;
