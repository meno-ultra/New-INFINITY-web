const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(email) {
    return String(email || "").toLowerCase().trim();
}

function validateEmail(email) {
    const v = normalizeEmail(email);
    if (!v) return { valid: false, message: "Email is required." };
    if (!emailRegex.test(v)) return { valid: false, message: "Please enter a valid email address." };
    return { valid: true, email: v };
}

function validateOtp(otp) {
    const v = String(otp || "").replace(/\D/g, "");
    if (!v) return { valid: false, message: "Verification code is required." };
    if (!/^\d{6}$/.test(v)) return { valid: false, message: "Enter the 6-digit verification code." };
    return { valid: true, otp: v };
}

function getPasswordChecks(value) {
    const v = String(value || "");
    return {
        length: v.length >= 8,
        upper: /[A-Z]/.test(v),
        lower: /[a-z]/.test(v),
        number: /\d/.test(v),
        special: /[^A-Za-z0-9]/.test(v),
    };
}

function validatePassword(password) {
    const v = String(password || "");
    if (!v) return { valid: false, message: "Password is required." };
    const checks = getPasswordChecks(v);
    if (!checks.length || !checks.upper || !checks.lower || !checks.number || !checks.special) {
        return { valid: false, message: "Password must meet all security requirements." };
    }
    return { valid: true };
}

function validateConfirmPassword(password, confirm) {
    if (!String(confirm || "")) return { valid: false, message: "Please confirm your password." };
    if (password !== confirm) return { valid: false, message: "Passwords do not match." };
    return { valid: true };
}

module.exports = {
    normalizeEmail,
    validateEmail,
    validateOtp,
    validatePassword,
    validateConfirmPassword,
    getPasswordChecks,
};
