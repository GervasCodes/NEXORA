const db = require("../../config/db");
const repo = require("./deliveryBusiness.repository");
const deliveryRepository = require("../delivery/delivery.repository");

// Delivery business-management (Round 4, Phase 9).
//
// Two kinds of work are managed here:
//  - Nexora-dispatch work done by the roster's agents. This is READ-ONLY
//    here: dispatch, offers, earnings and wallets run exactly as before;
//    the business just aggregates what its agents did (deliveries,
//    agent_earnings, ratings, acceptance/completion rates via the same
//    stats the dispatch scoring uses).
//  - Independent jobs (no Nexora order). Fully owned by this module. The
//    fee is record-only - nothing here touches wallets or agent_earnings.
//
// Job changes run in a transaction that row-locks the job first, so two
// simultaneous status changes/assignments can't both apply to the same
// starting state.

const MAX_ROSTER_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;

const fail = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const withTransaction = async (work) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const pageParams = (query) => {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    return { limit, page, offset: (page - 1) * limit };
};

// ---- business profile ----

exports.getMine = async (ownerUserId) => {
    const business = await repo.findByOwner(ownerUserId);
    return business || null;
};

exports.register = async (ownerUserId, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) throw fail("Business name is required.");

    // An agent that is already on someone else's roster can't also run a
    // business - one rider, one employer.
    if (await repo.findMembershipByAgent(ownerUserId)) {
        throw fail("You're on another delivery business's roster. Ask them to remove you first.");
    }
    if (await repo.findByOwner(ownerUserId)) {
        throw fail("You already have a delivery business.");
    }

    try {
        await repo.create(ownerUserId, trimmed);
        return await repo.findByOwner(ownerUserId);
    } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") throw fail("You already have a delivery business.");
        throw error;
    }
};

// ---- roster ----

exports.getRoster = async (business) => repo.findRoster(business.id);

exports.addAgent = async (business, email) => {
    const user = await repo.findUserByEmail((email || "").trim());
    if (!user) throw fail("No NEXORA user found with that email.");
    if (user.role !== "delivery_agent") throw fail("That email isn't registered as a delivery agent account.");
    if (user.account_verification_status !== "approved") {
        throw fail("That agent's account hasn't been approved yet.");
    }
    if (user.id === business.owner_user_id) throw fail("You can't add yourself to your own roster.");
    if (await repo.findByOwner(user.id)) throw fail("That agent runs their own delivery business.");

    if (await repo.countRoster(business.id) >= MAX_ROSTER_SIZE) {
        throw fail(`A roster can have at most ${MAX_ROSTER_SIZE} agents.`);
    }

    const existing = await repo.findMembershipByAgent(user.id);
    if (existing) {
        throw fail(existing.business_id === business.id
            ? "That agent is already on your roster."
            : "That agent is already on another delivery business's roster.");
    }

    try {
        await repo.addAgent(business.id, user.id);
    } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") throw fail("That agent is already on a roster.");
        throw error;
    }
    return { agent_id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email };
};

exports.removeAgent = async (business, agentId) => {
    if (await repo.countOpenJobsForAgent(business.id, agentId) > 0) {
        throw fail("This agent still has open jobs. Reassign or finish them before removing the agent.");
    }
    const affected = await repo.removeAgent(business.id, agentId);
    if (!affected) throw fail("Agent not found on your roster.", 404);
};

// ---- independent jobs ----

const money = (value) => Math.round(Number(value) * 100) / 100;

exports.createJob = async (business, input) => {
    const feeAmount = input.feeAmount === undefined || input.feeAmount === null || input.feeAmount === ""
        ? 0 : money(input.feeAmount);
    if (!Number.isFinite(feeAmount) || feeAmount < 0) throw fail("Fee must be zero or more.");

    const id = await repo.insertJob({
        businessId: business.id,
        reference: input.reference,
        pickupAddress: input.pickupAddress,
        dropoffAddress: input.dropoffAddress,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        description: input.description,
        feeAmount
    });
    return repo.findJob(business.id, id);
};

exports.listJobs = async (business, query) => {
    const { limit, page, offset } = pageParams(query);
    const { rows, total } = await repo.listJobs(business.id, {
        status: query.status || null,
        agentId: query.agent_id ? Number(query.agent_id) : null,
        limit,
        offset
    });
    return { items: rows, total, page, limit };
};

// Assign (agentId set) or unassign (agentId null) while the job hasn't
// been picked up yet. The agent must be on THIS business's roster.
exports.assignJob = async (business, jobId, agentId) => {
    return withTransaction(async (connection) => {
        const job = await repo.lockJob(connection, business.id, jobId);
        if (!job) throw fail("Job not found.", 404);
        if (!["created", "assigned"].includes(job.status)) {
            throw fail("Only jobs that haven't been picked up can be reassigned.");
        }

        if (agentId) {
            if (!(await repo.isRosterMember(connection, business.id, agentId))) {
                throw fail("That agent isn't on your roster.");
            }
            await repo.updateJob(connection, job.id, {
                assigned_agent_id: agentId, status: "assigned", assigned_at: new Date()
            });
        } else {
            await repo.updateJob(connection, job.id, {
                assigned_agent_id: null, status: "created", assigned_at: null
            });
        }
        return repo.findJob(business.id, job.id, connection);
    });
};

const ALLOWED_TRANSITIONS = {
    created: ["cancelled"],
    assigned: ["picked_up", "cancelled"],
    picked_up: ["delivered", "cancelled"]
};

exports.updateJobStatus = async (business, jobId, nextStatus) => {
    return withTransaction(async (connection) => {
        const job = await repo.lockJob(connection, business.id, jobId);
        if (!job) throw fail("Job not found.", 404);

        const allowed = ALLOWED_TRANSITIONS[job.status] || [];
        if (!allowed.includes(nextStatus)) {
            throw fail(`A ${job.status.replace("_", " ")} job can't be marked ${nextStatus.replace("_", " ")}.`);
        }

        const fields = { status: nextStatus };
        const now = new Date();
        if (nextStatus === "picked_up") fields.picked_up_at = now;
        if (nextStatus === "delivered") fields.delivered_at = now;
        if (nextStatus === "cancelled") fields.cancelled_at = now;

        await repo.updateJob(connection, job.id, fields);
        return repo.findJob(business.id, job.id, connection);
    });
};

// Record-only fee bookkeeping: set the agreed amount and/or mark it
// collected. Amount can't change once collected (the recorded figure is
// what was actually received); cancelled jobs can't be marked collected.
exports.updateJobFee = async (business, jobId, { feeAmount, collected }) => {
    return withTransaction(async (connection) => {
        const job = await repo.lockJob(connection, business.id, jobId);
        if (!job) throw fail("Job not found.", 404);

        const fields = {};

        if (feeAmount !== undefined && feeAmount !== null && feeAmount !== "") {
            const amount = money(feeAmount);
            if (!Number.isFinite(amount) || amount < 0) throw fail("Fee must be zero or more.");
            if (job.fee_collected && amount !== Number(job.fee_amount)) {
                throw fail("This fee is already marked collected - undo that before changing the amount.");
            }
            fields.fee_amount = amount;
        }

        if (collected !== undefined && collected !== null) {
            if (collected && !job.fee_collected) {
                if (job.status === "cancelled") throw fail("A cancelled job has no fee to collect.");
                fields.fee_collected = true;
                fields.fee_collected_at = new Date();
            } else if (!collected && job.fee_collected) {
                fields.fee_collected = false;
                fields.fee_collected_at = null;
            }
        }

        await repo.updateJob(connection, job.id, fields);
        return repo.findJob(business.id, job.id, connection);
    });
};

// ---- fleet overview ----

const toDateString = (date) => date.toISOString().slice(0, 10);

const resolveRange = (query) => {
    const to = query.to || toDateString(new Date());
    const from = query.from || toDateString(new Date(new Date(to).getTime() - 29 * DAY_MS));
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw fail("Invalid date range.");
    if (toMs < fromMs) throw fail("The end date must be on or after the start date.");
    if ((toMs - fromMs) / DAY_MS + 1 > MAX_REPORT_DAYS) throw fail("Choose a range of one year or less.");
    return { from, to };
};

exports.getOverview = async (business, query) => {
    const { from, to } = resolveRange(query);
    const roster = await repo.findRoster(business.id);
    const agentIds = roster.map((a) => a.agent_id);

    const [nexoraRows, earningsRows, independentRows, independentAll, statusCounts, stats, ratings] = await Promise.all([
        repo.nexoraDeliveriesByAgent(agentIds, from, to),
        repo.nexoraEarningsByAgent(agentIds, from, to),
        repo.independentByAgent(business.id, from, to),
        repo.independentTotals(business.id, from, to),
        repo.jobStatusCounts(business.id),
        // Same all-time acceptance/completion ratios dispatch scoring uses.
        deliveryRepository.findAgentPerformanceStats(agentIds),
        Promise.all(agentIds.map((id) => deliveryRepository.getAgentRatingSummary(id)))
    ]);

    const byId = (rows) => new Map(rows.map((r) => [r.agent_id, r]));
    const nexoraMap = byId(nexoraRows);
    const earningsMap = byId(earningsRows);
    const independentMap = byId(independentRows);

    const agents = roster.map((agent, index) => {
        const nex = nexoraMap.get(agent.agent_id);
        const ind = independentMap.get(agent.agent_id);
        const rating = ratings[index];
        const perf = stats[agent.agent_id] || {};
        return {
            agent_id: agent.agent_id,
            first_name: agent.first_name,
            last_name: agent.last_name,
            vehicle_type: agent.vehicle_type,
            nexora: {
                delivered: Number(nex?.delivered || 0),
                failed: Number(nex?.failed || 0),
                active: Number(nex?.active || 0),
                earnings: Number(earningsMap.get(agent.agent_id)?.earnings || 0)
            },
            independent: {
                delivered: Number(ind?.delivered || 0),
                fees_collected: Number(ind?.fees_collected || 0)
            },
            acceptance_rate: perf.acceptanceRate ?? null,
            completion_rate: perf.completionRate ?? null,
            average_rating: rating && rating.average_rating !== null ? Number(rating.average_rating) : null,
            rating_count: rating ? Number(rating.rating_count) : 0
        };
    });

    const sum = (pick) => agents.reduce((total, a) => total + pick(a), 0);
    const nexora = {
        delivered: sum((a) => a.nexora.delivered),
        failed: sum((a) => a.nexora.failed),
        earnings: sum((a) => a.nexora.earnings)
    };
    // Business-wide (not the sum over the current roster) so jobs done by
    // an agent who has since left, or whose account was deleted, still count.
    const independent = {
        delivered: Number(independentAll.delivered || 0),
        fees_collected: Number(independentAll.fees_collected || 0)
    };

    return {
        from,
        to,
        roster_size: roster.length,
        nexora,
        independent,
        combined: {
            delivered: nexora.delivered + independent.delivered,
            // Nexora earnings are what Nexora credited to the agents; independent
            // fees are what the owner recorded as collected off-platform.
            revenue: nexora.earnings + independent.fees_collected
        },
        open_jobs: statusCounts.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {}),
        agents
    };
};
