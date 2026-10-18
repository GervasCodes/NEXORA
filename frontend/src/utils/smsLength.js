// How many SMS segments a text will cost, for the Broadcast page counter.
// GSM-7 text fits 160 characters in one SMS (153 per part when split);
// anything outside the GSM-7 alphabet (emoji, many accented letters) makes
// the whole message UCS-2: 70 characters in one SMS (67 per part). A few
// GSM-7 characters (^ { } \ [ ] ~ | €) take two units.
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

export function smsInfo(text = "") {
    let units = 0;
    let gsm = true;

    for (const ch of text) {
        if (GSM_BASIC.includes(ch)) {
            units += 1;
        } else if (GSM_EXTENDED.includes(ch)) {
            units += 2;
        } else {
            gsm = false;
            break;
        }
    }

    if (!gsm) {
        // UCS-2 counts UTF-16 code units (an emoji is 2).
        units = text.length;
    }

    const single = gsm ? 160 : 70;
    const multi = gsm ? 153 : 67;
    const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);

    return { encoding: gsm ? "GSM-7" : "Unicode", units, segments, perSegment: units <= single ? single : multi };
}
