// Identity / business KYC documents must be uploaded as PDF documents,
// never as a photo of the document. These are the upload field names
// (== account_verification_documents.document_type values) that carry
// that rule; uploadDocument.middleware.js and
// fileContentValidation.middleware.js both read this list so the rule
// lives in one place and is enforced server-side, not just by the
// frontend's <input accept>.
//
// Deliberately NOT in this list: owner_photo (a selfie is a photo by
// nature).
const PDF_ONLY_FIELDS = Object.freeze([
    "national_id",
    "voter_id",
    "brela_certificate",
    "tin_certificate",
    "business_license",
    "drivers_license"
]);

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|bmp|webp|heic|heif|tiff?)$/i;

exports.PDF_ONLY_FIELDS = PDF_ONLY_FIELDS;
exports.isPdfOnlyField = (fieldname) => PDF_ONLY_FIELDS.includes(fieldname);
exports.hasImageExtension = (filename) => IMAGE_EXTENSION.test(filename || "");
