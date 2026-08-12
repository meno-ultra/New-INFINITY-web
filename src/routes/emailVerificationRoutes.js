const express = require("express");
const { rateLimit, emailIpKey } = require("../middlewares/rateLimit");
const { MailDeliveryError } = require("../services/mail/mailService");
const emailVerificationService = require("../services/emailVerificationService");

function createEmailVerificationRouter({ User }) {
    const router = express.Router();

    const resendLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        keyFn: emailIpKey("email-verify"),
        message: "Too many verification requests. Please wait 15 minutes.",
    });

    router.post("/verify", async (req, res) => {
        try {
            const email = String(req.body?.email || "").trim();
            const token = String(req.body?.token || "").trim();
            if (!email || !token) {
                return res.status(400).json({ error: "Verification link is invalid." });
            }
            const result = await emailVerificationService.verifyEmailToken(User, email, token);
            if (!result.ok) {
                return res.status(400).json({ error: result.message, code: result.code });
            }
            return res.json({ message: result.message });
        } catch (err) {
            console.error("Email verify error:", err);
            return res.status(500).json({ error: "Something went wrong. Please try again." });
        }
    });

    router.post("/resend", resendLimiter, async (req, res) => {
        try {
            const email = String(req.body?.email || "").trim();
            if (!email) return res.status(400).json({ error: "Email is required." });

            const { isMailConfigured } = require("../services/mail/mailService");
            if (!isMailConfigured()) {
                return res.status(503).json({ error: "Email service is temporarily unavailable." });
            }

            const result = await emailVerificationService.resendVerification(User, email);
            return res.json({
                message: result.message,
                expiresAt: result.expiresAt,
            });
        } catch (err) {
            if (err instanceof MailDeliveryError) {
                return res.status(err.status || 500).json({ error: err.message, code: err.code });
            }
            console.error("Email resend error:", err);
            return res.status(500).json({ error: "Something went wrong. Please try again." });
        }
    });

    return router;
}

module.exports = createEmailVerificationRouter;
