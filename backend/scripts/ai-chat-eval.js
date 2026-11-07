#!/usr/bin/env node
/**
 * Nexora Assistant evaluation runner (Workstream A, Phase 4).
 *
 *   node scripts/ai-chat-eval.js                 # offline: the free fallback path vs the set (no DB, no network)
 *   node scripts/ai-chat-eval.js --live --yes    # asks the REAL model every question and rule-checks the reply
 *   node scripts/ai-chat-eval.js --quality       # prints the real "chat" fallback rate from getQualityOverview
 *
 * Filters: --lang sw|en   --category trap   --ids trap-01,off-02
 *
 * IMPORTANT for --live: it goes through ai.service.chat, i.e. the real spend
 * guard and the real database. Every question writes rows to ai_usage_log
 * and ai_call_outcomes (feature "chat") and spends provider tokens. Run it
 * against a staging database, or accept that ~57 calls will appear in the
 * Admin AI quality panel. --yes is required so it is never run by accident.
 *
 * --quality needs the database (migration 108 table ai_call_outcomes) and
 * reports the last 7 days of REAL traffic: the share of chat calls that
 * ended in a fallback (AI off, cap reached, no provider, provider error).
 *
 * The rule checks are coarse safety/format checks (see tests/helpers/
 * aiChatEval.js). They do not grade wording: read the printed replies.
 *
 * Exit code: 0 when every checked item passes, 1 otherwise.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { loadEvalSet, classifyFallbackReply, checkReply } = require("../tests/helpers/aiChatEval");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
};

const selectItems = () => {
    let items = loadEvalSet();
    if (option("--lang")) items = items.filter((item) => item.lang === option("--lang"));
    if (option("--category")) items = items.filter((item) => item.category === option("--category"));
    if (option("--ids")) {
        const ids = new Set(option("--ids").split(","));
        items = items.filter((item) => ids.has(item.id));
    }
    return items;
};

const runOffline = (items) => {
    const { buildFallback } = require("../src/modules/ai/knowledge/fallback");
    let failed = 0;
    for (const item of items) {
        const result = buildFallback({ message: item.message, language: item.lang });
        const kind = classifyFallbackReply(result);
        const expected = item.fallback;
        const ok = (expected === "safe_any" ? kind !== "unknown" : kind === expected) && result.language === item.lang;
        if (!ok) failed += 1;
        console.log(`${ok ? "PASS" : "FAIL"} ${item.id.padEnd(9)} expected=${expected} got=${kind} lang=${result.language}`);
    }
    console.log(`\nOffline fallback path: ${items.length - failed}/${items.length} as expected.`);
    return failed;
};

const runLive = async (items) => {
    const registry = require("../src/modules/ai/providers/registry");
    const aiService = require("../src/modules/ai/ai.service");
    if (!registry.isAnyConfigured()) {
        console.error("No AI provider is configured (see README-ai-providers-gemini-groq-openrouter.md). Nothing to run.");
        return items.length;
    }
    let failed = 0;
    let fellBack = 0;
    for (const item of items) {
        const result = await aiService.chat({
            userId: null,
            role: item.role,
            language: item.lang,
            message: item.message,
            history: item.history
        });
        if (!result.aiGenerated) fellBack += 1;
        const failures = result.aiGenerated ? checkReply(item, result.reply) : [`model did not answer (${result.unavailableReason || "fallback"})`];
        if (failures.length) failed += 1;
        console.log(`\n${failures.length ? "FAIL" : "PASS"} ${item.id} [${item.category}/${item.lang}/${item.role || "signed-out"}]`);
        console.log(`  Q: ${item.message}`);
        console.log(`  A: ${String(result.reply).replace(/\s+/g, " ")}`);
        for (const failure of failures) console.log(`  - ${failure}`);
    }
    console.log(`\nLive run: ${items.length - failed}/${items.length} passed the rule checks; ${fellBack} fell back to the template path.`);
    return failed;
};

const runQuality = async () => {
    const aiService = require("../src/modules/ai/ai.service");
    const overview = await aiService.getQualityOverview();
    if (overview.length === 0) {
        console.log("No outcome rows in the last 7 days (or the query failed - see the log). Fallback rate cannot be reported.");
        return;
    }
    console.log("Last 7 days, per feature (highest fallback rate first):");
    for (const row of overview) {
        console.log(`  ${row.feature.padEnd(24)} total=${String(row.total).padStart(6)} success=${String(row.success).padStart(6)} fallback=${String(row.fallback).padStart(6)} rate=${row.fallbackRatePercent}%`);
    }
    const chat = overview.find((row) => row.feature === "chat");
    console.log(chat ? `\nNexora Assistant (chat) fallback rate: ${chat.fallbackRatePercent}% of ${chat.total} calls.` : "\nNo chat calls recorded in the window.");
};

const main = async () => {
    let failed = 0;
    if (flag("--quality")) {
        await runQuality();
    } else if (flag("--live")) {
        if (!flag("--yes")) {
            console.error("--live spends provider tokens and writes usage rows to the database. Re-run with --yes to confirm.");
            process.exit(2);
        }
        failed = await runLive(selectItems());
    } else {
        failed = runOffline(selectItems());
    }
    process.exit(failed ? 1 : 0);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
