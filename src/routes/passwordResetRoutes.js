const express = require("express");
const { rateLimit, emailIpKey } = require("../middlewares/rateLimit");
const {
    validateEmail,
    validateOtp,
    validatePassword,
    validateConfirmPassword,
} = require("../validators/passwordResetValidators");
const passwordResetService = require("../services/passwordResetService");
const { MailDeliveryError } = require("../services/mail/mailService");

function handleRouteError(res, err, context) {
    if (err instanceof MailDeliveryError) {
        console.error(`${context} mail error:`, err.cause?.message || err.message);
        return res.status(err.status || 500).json({
            error: err.message,
            code: err.code || "MAIL_DELIVERY_FAILED",
        });
    }
    console.error(`${context} error:`, err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
}

function createPasswordResetRouter({ User }) {
    const router = express.Router();

    const requestLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        keyFn: emailIpKey("pw-request"),
        message: "Too many reset requests. Please wait 15 minutes and try again.",
    });

    const verifyLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 12,
        keyFn: emailIpKey("pw-verify"),
        message: "Too many verification attempts. Please try again later.",
    });

    router.post("/request", requestLimiter, async (req, res) => {
        try {
            const emailCheck = validateEmail(req.body?.email);
            if (!emailCheck.valid) {
                return res.status(400).json({ error: emailCheck.message });
            }

            if (!passwordResetService.isMailConfigured()) {
                return res.status(503).json({ error: "Email service is temporarily unavailable. Please contact support." });
            }

            const result = await passwordResetService.createAndSendOtp(User, emailCheck.email);

            return res.json({
                message: result.message,
                expiresAt: result.expiresAt,
            });
        } catch (err) {
            return handleRouteError(res, err, "Password reset request");
        }
    });

    router.post("/resend", requestLimiter, async (req, res) => {
        try {
            const emailCheck = validateEmail(req.body?.email);
            if (!emailCheck.valid) {
                return res.status(400).json({ error: emailCheck.message });
            }

            if (!passwordResetService.isMailConfigured()) {
                return res.status(503).json({ error: "Email service is temporarily unavailable." });
            }

            passwordResetService.clearResetSession(req);
            await passwordResetService.saveSession(req);

            const result = await passwordResetService.createAndSendOtp(User, emailCheck.email);

            return res.json({
                message: result.message,
                expiresAt: result.expiresAt,
            });
        } catch (err) {
            return handleRouteError(res, err, "Password reset resend");
        }
    });

    router.post("/verify", verifyLimiter, async (req, res) => {
        try {
            const emailCheck = validateEmail(req.body?.email);
            if (!emailCheck.valid) {
                return res.status(400).json({ error: emailCheck.message });
            }

            const otpCheck = validateOtp(req.body?.otp);
            if (!otpCheck.valid) {
                return res.status(400).json({ error: otpCheck.message });
            }

            const result = await passwordResetService.verifyOtp(emailCheck.email, otpCheck.otp);
            if (!result.ok) {
                const status = result.code === "INVALID" ? 400 : 403;
                return res.status(status).json({ error: result.message, code: result.code });
            }

            passwordResetService.setResetSession(req, emailCheck.email, result.resetToken);
            await passwordResetService.saveSession(req);

            return res.json({
                message: result.message,
                resetToken: result.resetToken,
            });
        } catch (err) {
            console.error("Password reset verify error:", err);
            return res.status(500).json({ error: "Something went wrong. Please try again." });
        }
    });

    router.post("/reset", verifyLimiter, async (req, res) => {
        try {
            const emailCheck = validateEmail(req.body?.email);
            if (!emailCheck.valid) {
                return res.status(400).json({ error: emailCheck.message });
            }

            const passwordCheck = validatePassword(req.body?.password);
            if (!passwordCheck.valid) {
                return res.status(400).json({ error: passwordCheck.message });
            }

            const confirmCheck = validateConfirmPassword(req.body?.password, req.body?.confirmPassword);
            if (!confirmCheck.valid) {
                return res.status(400).json({ error: confirmCheck.message });
            }

            const resetToken = String(req.body?.resetToken || req.session?.passwordReset?.resetToken || "");
            if (!resetToken) {
                return res.status(403).json({ error: "Verification required before resetting password." });
            }

            const result = await passwordResetService.resetPassword(
                User,
                req,
                emailCheck.email,
                req.body.password,
                resetToken
            );

            if (!result.ok) {
                const status = result.code === "SAME_PASSWORD" ? 400 : 403;
                return res.status(status).json({ error: result.message, code: result.code });
            }

            return res.json({ message: result.message });
        } catch (err) {
            console.error("Password reset error:", err);
            return res.status(500).json({ error: "Something went wrong. Please try again." });
        }
    });

    return router;
}

module.exports = createPasswordResetRouter;
