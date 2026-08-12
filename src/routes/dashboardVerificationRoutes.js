const express = require("express");
const path = require("path");
const fs = require("fs");
const { createNotification } = require("../services/notificationService");
const realtime = require("../services/realtimeService");
const {
    getRequiredDocTypes,
    computeOverallStatus,
    DOC_LABELS,
} = require("../services/identityVerificationHelpers");

function createDashboardVerificationRouter({ User, requireRole }) {
    const router = express.Router();
    const staffOnly = requireRole(["employee", "manager", "primary"]);

    router.get("/pending", staffOnly, async (req, res) => {
        try {
            const filter = String(req.query.status || "actionable").toLowerCase();
            let query;
            if (filter === "all") {
                query = {
                    $or: [
                        { "identityVerification.status": { $in: ["pending", "reupload_requested", "approved", "rejected"] } },
                        { "identityVerification.submittedAt": { $ne: null } },
                    ],
                };
            } else if (filter === "approved") {
                query = { "identityVerification.status": "approved" };
            } else if (filter === "rejected") {
                query = { "identityVerification.status": { $in: ["rejected", "reupload_requested"] } };
            } else if (filter === "submitted" || filter === "pending") {
                query = { "identityVerification.status": "pending" };
            } else {
                query = { "identityVerification.status": { $in: ["pending", "reupload_requested"] } };
            }

            const users = await User.find(query)
                .select("name email accountType identityVerification profilePicture createdAt")
                .sort({ "identityVerification.submittedAt": -1, updatedAt: -1 })
                .limit(150)
                .lean();
            res.json({ users });
        } catch (err) {
            res.status(500).json({ error: "Unable to load verification queue." });
        }
    });

    router.get("/user/:id", staffOnly, async (req, res) => {
        try {
            const user = await User.findById(req.params.id)
                .select("name email phone accountType address city country companyName taxNumber identityVerification profilePicture companyLogo")
                .lean();
            if (!user) return res.status(404).json({ error: "User not found." });
            res.json({ user });
        } catch (err) {
            res.status(500).json({ error: "Unable to load user." });
        }
    });

    router.post("/user/:id/document-review", staffOnly, async (req, res) => {
        try {
            const { docType, status, reason } = req.body || {};
            if (!docType || !["approved", "rejected"].includes(status)) {
                return res.status(400).json({ error: "Invalid document review payload." });
            }

            const user = await User.findById(req.params.id);
            if (!user) return res.status(404).json({ error: "User not found." });

            const doc = (user.identityVerification?.documents || []).find((d) => d.type === docType);
            if (!doc) return res.status(404).json({ error: "Document not found." });

            doc.status = status;
            doc.rejectionReason = status === "rejected" ? String(reason || "").trim() : "";

            const overall = computeOverallStatus(user.identityVerification.documents, user.accountType);
            user.identityVerification.status = overall;
            user.identityVerification.reviewedBy = req.session.user.id;
            user.identityVerification.reviewedAt = new Date();
            if (status === "rejected" && reason) {
                user.identityVerification.staffNotes = String(reason).trim();
            }

            await user.save();

            realtime.emitIdentityUpdated(user);

            if (overall === "approved") {
                await createNotification({
                    userId: user._id,
                    type: "verification_approved",
                    title: "Identity verified",
                    message: "All your documents have been approved.",
                    link: "/profile.html#documents",
                });
            } else if (status === "rejected") {
                await createNotification({
                    userId: user._id,
                    type: "verification_rejected",
                    title: `${DOC_LABELS[docType] || docType} rejected`,
                    message: doc.rejectionReason || "Please upload a clearer document.",
                    link: "/profile.html#documents",
                });
            }

            res.json({
                message: "Document review saved.",
                document: doc,
                overallStatus: overall,
            });
        } catch (err) {
            res.status(500).json({ error: "Unable to save document review." });
        }
    });

    router.post("/user/:id/review", staffOnly, async (req, res) => {
        try {
            const { action, notes, documentReviews } = req.body || {};
            const allowed = ["approved", "rejected", "reupload_requested"];
            if (!allowed.includes(action) && !Array.isArray(documentReviews)) {
                return res.status(400).json({ error: "Invalid review action." });
            }

            const user = await User.findById(req.params.id);
            if (!user) return res.status(404).json({ error: "User not found." });

            if (Array.isArray(documentReviews) && documentReviews.length) {
                documentReviews.forEach((review) => {
                    const doc = (user.identityVerification?.documents || []).find((d) => d.type === review.docType);
                    if (!doc || !["approved", "rejected"].includes(review.status)) return;
                    doc.status = review.status;
                    doc.rejectionReason = review.status === "rejected" ? String(review.reason || "").trim() : "";
                });
                user.identityVerification.status = computeOverallStatus(
                    user.identityVerification.documents,
                    user.accountType
                );
            } else {
                user.identityVerification.status = action;
                const required = getRequiredDocTypes(user.accountType || "personal");
                (user.identityVerification.documents || []).forEach((doc) => {
                    if (!required.includes(doc.type)) return;
                    if (action === "approved") {
                        doc.status = "approved";
                        doc.rejectionReason = "";
                    } else if (action === "rejected" || action === "reupload_requested") {
                        doc.status = "rejected";
                        if (notes) doc.rejectionReason = String(notes).trim();
                    }
                });
            }

            user.identityVerification.staffNotes = notes ? String(notes).trim() : "";
            user.identityVerification.reviewedBy = req.session.user.id;
            user.identityVerification.reviewedAt = new Date();
            await user.save();

            realtime.emitIdentityUpdated(user);

            const finalStatus = user.identityVerification.status;
            const typeMap = {
                approved: "verification_approved",
                rejected: "verification_rejected",
                reupload_requested: "verification_reupload",
            };
            const titleMap = {
                approved: "Identity verified",
                rejected: "Identity verification rejected",
                reupload_requested: "Re-upload required",
            };

            if (typeMap[finalStatus]) {
                await createNotification({
                    userId: user._id,
                    type: typeMap[finalStatus],
                    title: titleMap[finalStatus],
                    message: user.identityVerification.staffNotes || titleMap[finalStatus],
                    link: "/profile.html#documents",
                });
            }

            res.json({ message: "Review saved.", status: finalStatus });
        } catch (err) {
            res.status(500).json({ error: "Unable to save review." });
        }
    });

    router.get("/document", staffOnly, async (req, res) => {
        try {
            const { userId, url, docType } = req.query;
            const user = await User.findById(userId).select("identityVerification").lean();
            if (!user) return res.status(404).json({ error: "Not found." });

            const docs = user.identityVerification?.documents || [];
            let doc = null;
            if (docType) {
                doc = docs.find((d) => d.type === docType);
            } else if (url) {
                const decoded = decodeURIComponent(String(url));
                doc = docs.find((d) => d.url === decoded || d.url === url);
            }
            if (!doc) return res.status(404).json({ error: "Document not found." });

            if (String(doc.url).startsWith("http")) {
                return res.redirect(doc.url);
            }

            const { PUBLIC_ROOT } = require("../config/paths");
            const filePath = path.join(PUBLIC_ROOT, doc.url);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing." });
            if (doc.mimeType) res.type(doc.mimeType);
            res.sendFile(path.resolve(filePath));
        } catch (err) {
            res.status(500).json({ error: "Unable to load document." });
        }
    });

    return router;
}

module.exports = createDashboardVerificationRouter;
