const express = require("express");
const { uploadUserFile } = require("../services/uploadService");
const { createNotification } = require("../services/notificationService");
const realtime = require("../services/realtimeService");
const {
    getRequiredDocTypes,
    getAllDocTypes,
    canUploadDocument,
    canRemoveDocument,
    canSubmitVerification,
    computeOverallStatus,
    statusForUploadedDocument,
    DOC_LABELS,
} = require("../services/identityVerificationHelpers");

function createProfileRouter({ User, requireAuth }) {
    const router = express.Router();

    router.get("/me", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id).select("-passwordHash").lean();
            if (!user) return res.status(404).json({ error: "User not found." });
            res.json({ profile: user });
        } catch (err) {
            res.status(500).json({ error: "Unable to load profile." });
        }
    });

    router.get("/me/verification-meta", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id).select("accountType identityVerification").lean();
            if (!user) return res.status(404).json({ error: "User not found." });
            const required = getRequiredDocTypes(user.accountType || "personal");
            const all = getAllDocTypes(user.accountType || "personal");
            res.json({
                required,
                all,
                labels: DOC_LABELS,
                overallStatus: user.identityVerification?.status || "none",
                submittedAt: user.identityVerification?.submittedAt || null,
                staffNotes: user.identityVerification?.staffNotes || "",
            });
        } catch (err) {
            res.status(500).json({ error: "Unable to load verification meta." });
        }
    });

    router.patch("/me", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id);
            if (!user) return res.status(404).json({ error: "User not found." });

            const body = req.body || {};
            const allowed = [
                "name", "phone", "address", "city", "country", "dateOfBirth",
                "contactPerson", "companyName", "taxNumber", "companyWebsite",
                "companyAddress",
            ];

            for (const key of allowed) {
                if (body[key] !== undefined) {
                    user[key] = body[key] == null ? null : String(body[key]).trim();
                }
            }

            if (user.accountType === "company" && body.contactPerson) {
                user.name = String(body.contactPerson).trim();
            }

            await user.save();
            res.json({ message: "Profile updated.", profile: user.toObject({ transform: (_d, ret) => { delete ret.passwordHash; return ret; } }) });
        } catch (err) {
            res.status(500).json({ error: "Unable to update profile." });
        }
    });

    router.post("/me/avatar", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id);
            const result = await uploadUserFile(user._id, "avatars", "avatar", req.body?.data, { allowPdf: false });
            if (!result.ok) return res.status(400).json({ error: result.message });
            user.profilePicture = result.url;
            await user.save();
            res.json({ message: "Profile picture updated.", url: result.url });
        } catch (err) {
            res.status(500).json({ error: "Unable to upload profile picture." });
        }
    });

    router.post("/me/company-logo", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id);
            if (user.accountType !== "company") {
                return res.status(400).json({ error: "Company logo is only for company accounts." });
            }
            const result = await uploadUserFile(user._id, "company", "logo", req.body?.data, { allowPdf: false });
            if (!result.ok) return res.status(400).json({ error: result.message });
            user.companyLogo = result.url;
            await user.save();
            res.json({ message: "Company logo updated.", url: result.url });
        } catch (err) {
            res.status(500).json({ error: "Unable to upload company logo." });
        }
    });

    router.get("/me/identity-document/:docType", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id).select("identityVerification").lean();
            const doc = (user?.identityVerification?.documents || []).find((d) => d.type === req.params.docType);
            if (!doc) return res.status(404).json({ error: "Document not found." });

            if (String(doc.url).startsWith("http")) {
                return res.redirect(doc.url);
            }

            const path = require("path");
            const fs = require("fs");
            const { PUBLIC_ROOT } = require("../config/paths");
            const filePath = path.join(PUBLIC_ROOT, doc.url);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing." });
            res.sendFile(path.resolve(filePath));        } catch (err) {
            res.status(500).json({ error: "Unable to load document." });
        }
    });

    router.post("/me/identity-document", requireAuth, async (req, res) => {
        try {
            const { docType, data } = req.body || {};
            const user = await User.findById(req.session.user.id);
            if (!user) return res.status(404).json({ error: "User not found." });

            const gate = canUploadDocument(user, docType);
            if (!gate.ok) return res.status(400).json({ error: gate.message });

            const allowPdf = user.accountType === "company";
            const result = await uploadUserFile(user._id, "identity", docType, data, { allowPdf });
            if (!result.ok) return res.status(400).json({ error: result.message });

            if (!user.identityVerification) {
                user.identityVerification = { status: "none", documents: [], staffNotes: "" };
            }
            const docs = user.identityVerification.documents || [];
            const idx = docs.findIndex((d) => d.type === docType);
            const previous = idx >= 0 ? docs[idx] : null;
            const entry = {
                type: docType,
                url: result.url,
                mimeType: result.mimeType,
                uploadedAt: new Date(),
                status: statusForUploadedDocument(previous),
                rejectionReason: "",
            };
            if (idx >= 0) docs[idx] = entry;
            else docs.push(entry);
            user.identityVerification.documents = docs;
            user.identityVerification.status = computeOverallStatus(
                docs,
                user.accountType || "personal"
            );

            await user.save();

            if (entry.status === "pending") {
                realtime.emitIdentitySubmitted(user);
            }

            res.json({
                message: entry.status === "pending"
                    ? "Document updated and queued for review."
                    : "Document saved.",
                document: entry,
                overallStatus: user.identityVerification.status,
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Unable to upload document." });
        }
    });

    router.delete("/me/identity-document/:docType", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id);
            if (!user?.identityVerification) return res.status(404).json({ error: "Document not found." });

            const gate = canRemoveDocument(user, req.params.docType);
            if (!gate.ok) return res.status(400).json({ error: gate.message });

            user.identityVerification.documents = (user.identityVerification.documents || [])
                .filter((d) => d.type !== req.params.docType);
            user.identityVerification.status = computeOverallStatus(
                user.identityVerification.documents,
                user.accountType || "personal"
            );
            await user.save();
            res.json({ message: "Document removed.", overallStatus: user.identityVerification.status });
        } catch (err) {
            res.status(500).json({ error: "Unable to remove document." });
        }
    });

    router.post("/me/submit-identity", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id);
            const gate = canSubmitVerification(user);
            if (!gate.ok) return res.status(400).json({ error: gate.message });

            const required = getRequiredDocTypes(user.accountType || "personal");
            const docs = user.identityVerification?.documents || [];

            docs.forEach((doc) => {
                if (required.includes(doc.type) && doc.status === "draft") {
                    doc.status = "pending";
                    doc.rejectionReason = "";
                }
            });

            user.identityVerification.documents = docs;
            if (!user.identityVerification.submittedAt) {
                user.identityVerification.submittedAt = new Date();
            }
            user.identityVerification.status = computeOverallStatus(
                docs,
                user.accountType || "personal"
            );
            await user.save();

            realtime.emitIdentitySubmitted(user);

            res.json({
                message: "All documents submitted for verification.",
                status: "pending",
                submittedAt: user.identityVerification.submittedAt,
            });
        } catch (err) {
            res.status(500).json({ error: "Unable to submit verification." });
        }
    });

    return router;
}

module.exports = createProfileRouter;
