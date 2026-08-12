const crypto = require("crypto");
const bcrypt = require("bcrypt");
const EmailVerificationToken = require("../models/EmailVerificationToken");
const { sendEmailVerificationEmail, isMailConfigured } = require("./mail/mailService");
const { getAppBaseUrl } = require("./mail/mailConfig");
const { createNotification } = require("./notificationService");

const TOKEN_TTL_MS = 15 * 60 * 1000;
const GENERIC_RESEND_MESSAGE = "If an account exists for this email, a verification link has been sent.";

async function invalidatePreviousTokens(userId) {
    await EmailVerificationToken.updateMany(
        { userId, used: false },
        { $set: { used: true } }
    );
}

async function createAndSendVerification(User, user) {
    if (!user || user.emailVerified) {
        return { ok: true, sent: false, message: "Email is already verified." };
    }
    if (!isMailConfigured()) {
        throw new Error("Email service is not configured");
    }

    await invalidatePreviousTokens(user._id);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await EmailVerificationToken.create({
        userId: user._id,
        email: user.email,
        tokenHash,
        expiresAt,
        used: false,
    });

    const verifyUrl = `${getAppBaseUrl()}/verify-email.html?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(user.email)}`;

    try {
        await sendEmailVerificationEmail({
            to: user.email,
            name: user.name,
            verifyUrl,
        });
    } catch (err) {
        await EmailVerificationToken.deleteMany({ userId: user._id, tokenHash, used: false });
        throw err;
    }

    return {
        ok: true,
        sent: true,
        message: GENERIC_RESEND_MESSAGE,
        expiresAt: expiresAt.toISOString(),
    };
}

async function verifyEmailToken(User, email, rawToken) {
    const normalized = String(email || "").toLowerCase().trim();
    const record = await EmailVerificationToken.findOne({
        email: normalized,
        used: false,
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!record) {
        return { ok: false, code: "EXPIRED", message: "Verification link has expired. Please request a new one." };
    }

    const match = await bcrypt.compare(String(rawToken || ""), record.tokenHash);
    if (!match) {
        return { ok: false, code: "INVALID", message: "Invalid verification link." };
    }

    record.used = true;
    await record.save();

    const user = await User.findById(record.userId);
    if (!user) {
        return { ok: false, code: "NOT_FOUND", message: "Account not found." };
    }

    if (!user.emailVerified) {
        user.emailVerified = true;
        await user.save();
        await createNotification({
            userId: user._id,
            type: "email_verified",
            title: "Email verified",
            message: "Your email address has been verified successfully.",
            link: "/profile.html",
        });
    }

    await invalidatePreviousTokens(user._id);

    return { ok: true, message: "Email verified successfully." };
}

async function resendVerification(User, email) {
    const normalized = String(email || "").toLowerCase().trim();
    const user = await User.findOne({ email: normalized });
    if (!user || user.emailVerified) {
        return {
            ok: true,
            sent: false,
            message: GENERIC_RESEND_MESSAGE,
            expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
        };
    }
    return createAndSendVerification(User, user);
}

module.exports = {
    TOKEN_TTL_MS,
    GENERIC_RESEND_MESSAGE,
    createAndSendVerification,
    verifyEmailToken,
    resendVerification,
};
