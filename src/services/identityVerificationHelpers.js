const PERSONAL_DOCS = [
    "national_id_front",
    "national_id_back",
    "driving_license_front",
    "driving_license_back",
];

const COMPANY_REQUIRED = ["commercial_register", "tax_card"];
const COMPANY_OPTIONAL = ["company_license"];

const DOC_LABELS = {
    national_id_front: "National ID (Front)",
    national_id_back: "National ID (Back)",
    driving_license_front: "Driving License (Front)",
    driving_license_back: "Driving License (Back)",
    commercial_register: "Commercial Register",
    tax_card: "Tax Card",
    company_license: "Company License",
};

function getRequiredDocTypes(accountType) {
    return accountType === "company" ? [...COMPANY_REQUIRED] : [...PERSONAL_DOCS];
}

function getAllDocTypes(accountType) {
    return accountType === "company"
        ? [...COMPANY_REQUIRED, ...COMPANY_OPTIONAL]
        : [...PERSONAL_DOCS];
}

function findDocument(user, docType) {
    return (user?.identityVerification?.documents || []).find((d) => d.type === docType) || null;
}

function docMap(documents) {
    return Object.fromEntries((documents || []).map((d) => [d.type, d]));
}

function computeOverallStatus(documents, accountType) {
    const required = getRequiredDocTypes(accountType);
    const byType = docMap(documents);

    const missing = required.filter((t) => !byType[t]?.url);
    if (missing.length) {
        if (required.some((t) => byType[t]?.status === "rejected")) return "reupload_requested";
        if (required.some((t) => byType[t]?.status === "pending")) return "pending";
        return "none";
    }

    const statuses = required.map((t) => byType[t]?.status || "draft");
    if (statuses.every((s) => s === "approved")) return "approved";
    if (statuses.some((s) => s === "rejected")) return "reupload_requested";
    if (statuses.some((s) => s === "pending")) return "pending";
    if (statuses.every((s) => s === "draft")) return "none";
    return "pending";
}

function canUploadDocument(user, docType) {
    const allowed = getAllDocTypes(user.accountType || "personal");
    if (!allowed.includes(docType)) {
        return { ok: false, message: "Invalid document type." };
    }
    return { ok: true };
}

function canRemoveDocument(user, docType) {
    const existing = findDocument(user, docType);
    if (!existing) return { ok: false, message: "Document not found." };
    return { ok: true };
}

function canSubmitVerification(user) {
    const overall = user?.identityVerification?.status || "none";
    if (overall === "approved") {
        return { ok: false, message: "Your identity is already verified." };
    }

    const required = getRequiredDocTypes(user.accountType || "personal");
    const byType = docMap(user?.identityVerification?.documents || []);

    const missing = required.filter((t) => !byType[t]?.url);
    if (missing.length) {
        return {
            ok: false,
            message: `Please upload all required documents: ${missing.map((t) => DOC_LABELS[t] || t).join(", ")}.`,
        };
    }

    const stillRejected = required.filter((t) => byType[t]?.status === "rejected");
    if (stillRejected.length) {
        return {
            ok: false,
            message: `Please re-upload rejected documents: ${stillRejected.map((t) => DOC_LABELS[t] || t).join(", ")}.`,
        };
    }

    const hasDrafts = required.some((t) => byType[t]?.status === "draft");
    if (!hasDrafts) {
        return {
            ok: false,
            message: overall === "pending"
                ? "All uploaded documents are already under review."
                : "Nothing new to submit.",
        };
    }

    return { ok: true };
}

function statusForUploadedDocument(previous) {
    if (!previous?.status || previous.status === "draft") return "draft";
    return "pending";
}

module.exports = {
    DOC_LABELS,
    getRequiredDocTypes,
    getAllDocTypes,
    findDocument,
    canUploadDocument,
    canRemoveDocument,
    canSubmitVerification,
    computeOverallStatus,
    statusForUploadedDocument,
};
