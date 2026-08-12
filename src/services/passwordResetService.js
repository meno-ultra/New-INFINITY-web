const crypto = require("crypto");
const bcrypt = require("bcrypt");
const PasswordResetOtp = require("../models/PasswordResetOtp");
const { sendPasswordResetEmail, isMailConfigured } = require("./mail/mailService");

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RESET_SESSION_TTL_MS = 15 * 60 * 1000;

const GENERIC_REQUEST_MESSAGE =
    "If an account exists for this email, a verification code has been sent.";

function generateSecureOtp() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function normalizeEmail(email) {
    return String(email || "").toLowerCase().trim();
}

function genericExpiresAt() {
    return new Date(Date.now() + OTP_TTL_MS).toISOString();
}

async function invalidatePreviousOtps(email) {
    await PasswordResetOtp.updateMany(
        { email: normalizeEmail(email), used: false },
        { $set: { used: true } }
    );
}

async function createAndSendOtp(User, email) {
    const normalized = normalizeEmail(email);
    const expiresAt = genericExpiresAt();

    const user = await User.findOne({ email: normalized }).select("email name").lean();
    if (!user) {
        return {
            ok: true,
            sent: false,
            expiresAt,
            message: GENERIC_REQUEST_MESSAGE,
        };
    }

    if (!isMailConfigured()) {
        throw new Error("Email service is not configured");
    }

    await invalidatePreviousOtps(normalized);

    const otp = generateSecureOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    await PasswordResetOtp.create({
        email: normalized,
        otpHash,
        expiresAt: new Date(expiresAt),
        used: false,
        verifyAttempts: 0,
    });

    try {
        await sendPasswordResetEmail({
            to: user.email,
            name: user.name,
            otp,
        });
    } catch (err) {
        await PasswordResetOtp.deleteMany({
            email: normalized,
            otpHash,
            used: false,
        });
        throw err;
    }

    return {
        ok: true,
        sent: true,
        expiresAt,
        message: GENERIC_REQUEST_MESSAGE,
    };
}

async function findActiveOtpRecord(email) {
    return PasswordResetOtp.findOne({
        email: normalizeEmail(email),
        used: false,
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
}

async function lockOtpRecord(record) {
    record.used = true;
    record.verifyAttempts = MAX_VERIFY_ATTEMPTS;
    await record.save();
}

async function verifyOtp(email, otpPlain) {
    const record = await findActiveOtpRecord(email);
    if (!record) {
        return { ok: false, code: "EXPIRED", message: "Verification code has expired. Please request a new one." };
    }

    if (record.verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
        await lockOtpRecord(record);
        return { ok: false, code: "LOCKED", message: "Too many incorrect attempts. Please request a new code." };
    }

    const match = await bcrypt.compare(otpPlain, record.otpHash);
    if (!match) {
        record.verifyAttempts += 1;
        if (record.verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
            await lockOtpRecord(record);
            return { ok: false, code: "LOCKED", message: "Too many incorrect attempts. Please request a new code." };
        }
        await record.save();
        const remaining = MAX_VERIFY_ATTEMPTS - record.verifyAttempts;
        return {
            ok: false,
            code: "INVALID",
            message: `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        };
    }

    record.used = true;
    await record.save();

    return {
        ok: true,
        resetToken: crypto.randomBytes(32).toString("hex"),
        message: "Verification successful.",
    };
}

function setResetSession(req, email, resetToken) {
    req.session.passwordReset = {
        email: normalizeEmail(email),
        resetToken,
        verifiedAt: Date.now(),
        expiresAt: Date.now() + RESET_SESSION_TTL_MS,
    };
}

function clearResetSession(req) {
    if (req.session) delete req.session.passwordReset;
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        if (!req.session) return resolve();
        req.session.save((err) => (err ? reject(err) : resolve()));
    });
}

async function destroyResetFlow(req, email) {
    await invalidatePreviousOtps(email);
    clearResetSession(req);
    await saveSession(req);
}

function getValidResetSession(req, email) {
    const session = req.session?.passwordReset;
    if (!session) return null;
    if (Date.now() > session.expiresAt) return null;
    if (normalizeEmail(session.email) !== normalizeEmail(email)) return null;
    return session;
}

async function resetPassword(User, req, email, password, resetToken) {
    const session = getValidResetSession(req, email);
    if (!session || session.resetToken !== resetToken) {
        return { ok: false, code: "SESSION", message: "Your reset session has expired. Please verify your code again." };
    }

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) {
        return { ok: false, code: "NOT_FOUND", message: "Account not found." };
    }

    if (user.passwordHash) {
        const samePassword = await bcrypt.compare(password, user.passwordHash);
        if (samePassword) {
            return {
                ok: false,
                code: "SAME_PASSWORD",
                message: "Please choose a different password than your current one.",
            };
        }
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    await destroyResetFlow(req, email);

    return { ok: true, message: "Password updated successfully." };
}

module.exports = {
    OTP_TTL_MS,
    MAX_VERIFY_ATTEMPTS,
    GENERIC_REQUEST_MESSAGE,
    createAndSendOtp,
    verifyOtp,
    setResetSession,
    clearResetSession,
    saveSession,
    destroyResetFlow,
    getValidResetSession,
    resetPassword,
    isMailConfigured,
};
