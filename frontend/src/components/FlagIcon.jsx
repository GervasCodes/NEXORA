// Small inline SVG flags for the language menu. Drawn as SVG on purpose:
// flag emoji do not render on Windows (they show up as bare letters), so
// they can't be relied on for a control every visitor sees.
//
// To support a new language, add its flag here (key = the `flag` value in
// LANGUAGES, see LanguageContext.jsx) and one entry in LANGUAGES.

function UsFlag() {
    // 13 stripes, canton covers the top 7 (7/13 of 14 = 7.54).
    const h = 14 / 13;
    const stripes = [1, 3, 5, 7, 9, 11].map((i) => (
        <rect key={i} y={i * h} width="20" height={h} fill="#fff" />
    ));
    const stars = [];
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 6; c++) {
            stars.push(<circle key={`${r}-${c}`} cx={0.9 + c * 1.3} cy={0.95 + r * 1.35} r="0.34" fill="#fff" />);
        }
    }
    return (
        <>
            <rect width="20" height="14" fill="#B22234" />
            {stripes}
            <rect width="8" height={7 * h} fill="#3C3B6E" />
            {stars}
        </>
    );
}

function TzFlag() {
    // Green (top-left) and blue (bottom-right) triangles split by a black
    // diagonal band edged in yellow.
    return (
        <>
            <polygon points="0,0 20,0 0,14" fill="#1EB53A" />
            <polygon points="20,14 20,0 0,14" fill="#00A3DD" />
            <line x1="-1" y1="14.7" x2="21" y2="-0.7" stroke="#FCD116" strokeWidth="5.2" />
            <line x1="-1" y1="14.7" x2="21" y2="-0.7" stroke="#000" strokeWidth="3.6" />
        </>
    );
}

const FLAGS = { us: UsFlag, tz: TzFlag };

export default function FlagIcon({ flag, className = "w-5 h-[14px]" }) {
    const Flag = FLAGS[flag];
    if (!Flag) return null;
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 14"
            aria-hidden="true"
            focusable="false"
            className={`shrink-0 rounded-[2px] ring-1 ring-black/15 ${className}`}
        >
            <Flag />
        </svg>
    );
}
