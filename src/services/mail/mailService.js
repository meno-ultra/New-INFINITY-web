const {
    getAppBaseUrl,
    getDiagnostics,
    getMailTransportMode,
    getSenderConfig,
    isMailConfigured,
    isRenderEnvironment,
} = require("./mailConfig");
const {
    buildPasswordResetHtml,
    buildPasswordResetText,
    buildEmailVerificationHtml,
    buildEmailVerificationText,
    resolveEmailLogo,
    resolveLogoSrcForApi,
} = require("./emailTemplates");
const { sendViaBrevoApi, verifyBrevoApi } = require("./brevoApiTransport");
const { sendViaSmtp, verifySmtpTransporter } = require("./smtpTransport");

class MailDeliveryError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "MailDeliveryError";
        this.code = options.code || "MAIL_DELIVERY_FAILED";
        this.status = options.status || 500;
        this.cause = options.cause || null;
    }
}

let verifyPromise = null;
let lastVerifyResult = null;

function logMailDiagnostics() {
    const d = getDiagnostics();
    console.log("[mail] Configuration:");
    console.log(`  transport: ${d.transport}`);
    console.log(`  renderEnvironment: ${d.renderEnvironment}`);
    console.log(`  brevoApiKeyPresent: ${d.brevoApiKeyPresent}`);
    console.log(`  smtpHost: ${d.smtpHost}`);
    console.log(`  smtpPort: ${d.smtpPort}`);
    console.log(`  smtpSecure: ${d.smtpSecure}`);
    console.log(`  smtpRequireTls: ${d.smtpRequireTls}`);
    console.log(`  smtpCredentialsPresent: ${d.smtpCredentialsPresent}`);
    console.log(`  smtpFromEmailPresent: ${d.smtpFromEmailPresent}`);
    console.log(`  emailLogoUrlPresent: ${d.emailLogoUrlPresent}`);
    console.log(`  connectionTimeoutMs: ${d.timeouts.connectionTimeout}`);
    console.log(`  greetingTimeoutMs: ${d.timeouts.greetingTimeout}`);
    console.log(`  socketTimeoutMs: ${d.timeouts.socketTimeout}`);
    console.log(`  sendTimeoutMs: ${d.timeouts.sendTimeout}`);

    if (d.renderEnvironment && d.transport === "smtp") {
        console.warn(
            "[mail] WARNING: Render blocks outbound SMTP on free-tier services (ports 25/465/587). "
            + "Set BREVO_API_KEY to use Brevo HTTPS API instead of SMTP."
        );
    }
}

async function verifyMailTransport(force = false) {
    if (!isMailConfigured()) {
        lastVerifyResult = { ok: false, transport: "none", error: "Mail is not configured" };
        console.warn("[mail] verify skipped: mail is not configured");
        return lastVerifyResult;
    }

    if (verifyPromise && !force) {
        return verifyPromise;
    }

    const mode = getMailTransportMode();
    verifyPromise = (async () => {
        try {
            if (mode === "api") {
                await verifyBrevoApi();
                lastVerifyResult = { ok: true, transport: "api" };
                console.log("[mail] Brevo API verify: success");
                return lastVerifyResult;
            }

            await verifySmtpTransporter();
            lastVerifyResult = { ok: true, transport: "smtp" };
            console.log("[mail] SMTP transporter.verify(): success");
            return lastVerifyResult;
        } catch (err) {
            lastVerifyResult = {
                ok: false,
                transport: mode,
                error: err.message,
                code: err.code,
            };
            console.error(`[mail] ${mode.toUpperCase()} verify failed:`, err.message);
            if (isRenderEnvironment() && mode === "smtp") {
                console.error(
                    "[mail] Render likely blocks SMTP. Add BREVO_API_KEY in Render environment variables."
                );
            }
            return lastVerifyResult;
        } finally {
            verifyPromise = null;
        }
    })();

    return verifyPromise;
}

async function initializeMailService() {
    logMailDiagnostics();
    await verifyMailTransport();
}

async function sendPasswordResetEmail({ to, name, otp }) {
    if (!isMailConfigured()) {
        throw new MailDeliveryError(
            "Email service is not configured.",
            { code: "MAIL_NOT_CONFIGURED", status: 503 }
        );
    }

    const mode = getMailTransportMode();
    const logo = resolveEmailLogo();
    const { fromEmail, fromName } = getSenderConfig();
    const subject = "Reset Your Infinity Password";
    const text = buildPasswordResetText({ name, otp });

    try {
        if (mode === "api") {
            const logoSrc = resolveLogoSrcForApi(logo);
            const html = buildPasswordResetHtml({ name, otp, logoSrc });
            await sendMailMessage({ to, subject, html, text });
            return;
        }

        const html = buildPasswordResetHtml({ name, otp, logoSrc: logo.src });
        await sendMailMessage({ to, subject, html, text, attachments: logo.attachments });
    } catch (err) {
        if (err instanceof MailDeliveryError) throw err;
        wrapMailError(err, "Unable to send verification email. Please try again later.");
    }
}

async function sendMailMessage({ to, subject, html, text, attachments = [] }) {
    const mode = getMailTransportMode();
    const { fromEmail, fromName } = getSenderConfig();
    if (mode === "api") {
        await sendViaBrevoApi({ to, subject, html, text });
        return;
    }
    await sendViaSmtp({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
        text,
        attachments,
    });
}

function wrapMailError(err, fallbackMessage) {
    const isTimeout = err.code === "MAIL_TIMEOUT"
        || err.code === "ETIMEDOUT"
        || err.code === "ESOCKET"
        || /timed out/i.test(err.message || "");
    throw new MailDeliveryError(
        isTimeout
            ? "Unable to send email right now. Please try again in a few minutes."
            : (fallbackMessage || "Unable to send email. Please try again later."),
        {
            code: isTimeout ? "MAIL_TIMEOUT" : "MAIL_DELIVERY_FAILED",
            status: 500,
            cause: err,
        }
    );
}

async function sendEmailVerificationEmail({ to, name, verifyUrl }) {
    if (!isMailConfigured()) {
        throw new MailDeliveryError("Email service is not configured.", { code: "MAIL_NOT_CONFIGURED", status: 503 });
    }
    const logo = resolveEmailLogo();
    const subject = "Verify Your INFINITY Account";
    const text = buildEmailVerificationText({ name, verifyUrl });
    try {
        if (getMailTransportMode() === "api") {
            const html = buildEmailVerificationHtml({ name, verifyUrl, logoSrc: resolveLogoSrcForApi(logo) });
            await sendMailMessage({ to, subject, html, text });
            return;
        }
        const html = buildEmailVerificationHtml({ name, verifyUrl, logoSrc: logo.src });
        await sendMailMessage({ to, subject, html, text, attachments: logo.attachments });
    } catch (err) {
        if (err instanceof MailDeliveryError) throw err;
        wrapMailError(err, "Unable to send verification email. Please try again later.");
    }
}

function getLastVerifyResult() {
    return lastVerifyResult;
}

module.exports = {
    MailDeliveryError,
    initializeMailService,
    verifyMailTransport,
    getLastVerifyResult,
    isMailConfigured,
    sendPasswordResetEmail,
    sendEmailVerificationEmail,
    resolveEmailLogo,
    logMailDiagnostics,
};
