/**
 * Live-selling sessions (Phase Q7) - a scheduling/announcement layer,
 * not real video streaming infrastructure. See migration 089's header
 * comment for the explicit scope reasoning.
 */

const liveSellingRepository = require("./liveSelling.repository");

exports.create = async (sellerId, { title, description, externalLink, scheduledAt }) => {
    if (!title || !externalLink || !scheduledAt) {
        throw new Error("Title, link, and scheduled time are required");
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
        throw new Error("Scheduled time must be in the future");
    }

    const id = await liveSellingRepository.create(sellerId, { title, description, externalLink, scheduledAt });
    return liveSellingRepository.findById(id);
};

exports.listUpcoming = async () => liveSellingRepository.findUpcoming();

exports.listBySeller = async (sellerId) => liveSellingRepository.findBySeller(sellerId);

exports.setStatus = async (id, sellerId, status) => {
    if (!["live", "ended", "cancelled"].includes(status)) {
        throw new Error("Invalid status");
    }
    const session = await liveSellingRepository.findById(id);
    if (!session || session.seller_id !== sellerId) {
        throw new Error("Session not found");
    }
    await liveSellingRepository.setStatus(id, status);
    return liveSellingRepository.findById(id);
};
