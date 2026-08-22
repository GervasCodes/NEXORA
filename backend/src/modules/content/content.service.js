/**
 * SEO content engine (Phase Q7) - category/buying guides. Admin-authored
 * only (no seller-submitted content pipeline/moderation queue to build
 * here - "SEO content engine" in the roadmap reads as a marketing/
 * editorial tool, not user-generated content).
 */

const contentRepository = require("./content.repository");

const toSlug = (title) =>
    title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]/g, "");

const uniqueSlug = async (title) => {
    const base = toSlug(title);
    let slug = base;
    let suffix = 2;
    while (await contentRepository.findSlug(slug)) {
        slug = `${base}-${suffix}`;
        suffix += 1;
    }
    return slug;
};

exports.listPublished = async (filter) => contentRepository.findPublished(filter);

exports.getBySlug = async (slug) => contentRepository.findBySlug(slug);

exports.listAllAdmin = async () => contentRepository.findAllAdmin();

exports.getByIdAdmin = async (id) => contentRepository.findById(id);

exports.create = async (authorId, { title, categoryId, bodyMarkdown, excerpt, seoMetaDescription, coverImageUrl }) => {
    if (!title || !bodyMarkdown) {
        throw new Error("Title and body are required");
    }
    const slug = await uniqueSlug(title);
    const id = await contentRepository.create({
        title, slug, categoryId, bodyMarkdown, excerpt, seoMetaDescription, coverImageUrl, authorId
    });
    return contentRepository.findById(id);
};

exports.update = async (id, fields) => {
    const existing = await contentRepository.findById(id);
    if (!existing) throw new Error("Article not found");
    await contentRepository.update(id, fields);
    return contentRepository.findById(id);
};

exports.setStatus = async (id, status) => {
    if (!["draft", "published"].includes(status)) {
        throw new Error("Invalid status");
    }
    await contentRepository.setStatus(id, status);
    return contentRepository.findById(id);
};
