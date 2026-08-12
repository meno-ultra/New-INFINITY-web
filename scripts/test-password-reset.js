/**
 * One-off E2E verification for password reset flow.
 * Run: node scripts/test-password-reset.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const mailService = require("../src/services/mail/mailService");

const MONGODB_URI = process.env.MONGODB_URI;
const TEMP_PASSWORD = "TempOld9!Aa";
const NEW_PASSWORD = `NewPass9!${String(Date.now()).slice(-4)}`;

let capturedOtp = null;
const originalSend = mailService.sendPasswordResetEmail;
mailService.sendPasswordResetEmail = async ({ otp, ...rest }) => {
    capturedOtp = otp;
    return originalSend({ otp, ...rest });
};

delete require.cache[require.resolve("../src/services/passwordResetService")];
const passwordResetService = require("../src/services/passwordResetService");

function mockReq() {
    return { session: { save: (cb) => cb(null) } };
}

async function main() {
    if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
    if (!mailService.isMailConfigured()) throw new Error("SMTP not configured");

    await mongoose.connect(MONGODB_URI);
    const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
        email: String,
        passwordHash: String,
        name: String,
    }, { strict: false }));

    const user = await User.findOne({ passwordHash: { $exists: true, $ne: null } }).select("email passwordHash name").lean();
    if (!user) throw new Error("No local-password user found for test");

    const email = user.email;
    const originalHash = user.passwordHash;

    await User.updateOne({ email }, { $set: { passwordHash: await bcrypt.hash(TEMP_PASSWORD, 10) } });

    console.log("Testing with:", email);

    const sendResult = await passwordResetService.createAndSendOtp(User, email);
    if (!sendResult.sent) throw new Error("Test user OTP was not sent");
    if (!capturedOtp || !/^\d{6}$/.test(capturedOtp)) throw new Error("OTP not captured");

    for (let i = 0; i < 4; i += 1) {
        const bad = await passwordResetService.verifyOtp(email, "000000");
        if (bad.ok) throw new Error("Bad OTP should fail");
    }
    const locked = await passwordResetService.verifyOtp(email, "000000");
    if (locked.ok || locked.code !== "LOCKED") throw new Error("5th attempt should lock OTP");

    capturedOtp = null;
    await passwordResetService.createAndSendOtp(User, email);
    if (!capturedOtp) throw new Error("Second OTP not captured");

    const verifyResult = await passwordResetService.verifyOtp(email, capturedOtp);
    if (!verifyResult.ok) throw new Error(verifyResult.message);

    const req = mockReq();
    passwordResetService.setResetSession(req, email, verifyResult.resetToken);

    const samePw = await passwordResetService.resetPassword(
        User, req, email, TEMP_PASSWORD, verifyResult.resetToken
    );
    if (samePw.ok || samePw.code !== "SAME_PASSWORD") {
        throw new Error("Same password should be rejected");
    }

    const resetResult = await passwordResetService.resetPassword(
        User, req, email, NEW_PASSWORD, verifyResult.resetToken
    );
    if (!resetResult.ok) throw new Error(resetResult.message);
    if (req.session.passwordReset) throw new Error("Reset session was not destroyed");

    const updated = await User.findOne({ email }).select("passwordHash").lean();
    const loginOk = await bcrypt.compare(NEW_PASSWORD, updated.passwordHash);
    const oldFails = await bcrypt.compare(TEMP_PASSWORD, updated.passwordHash);
    if (!loginOk || oldFails) throw new Error("Password update verification failed");

    const reuse = await passwordResetService.verifyOtp(email, capturedOtp);
    if (reuse.ok) throw new Error("Reused OTP should fail");

    await User.updateOne({ email }, { $set: { passwordHash: originalHash } });
    console.log("Restored original password");
    console.log("E2E password reset: PASS");
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error("E2E password reset: FAIL", err.message);
    process.exit(1);
});
