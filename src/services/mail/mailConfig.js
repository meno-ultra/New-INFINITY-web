/**
 * Central mail configuration — reads process.env at call time for production safety.
 */
const DEFAULT_SMTP_HOST = "smtp-relay.brevo.com";
const DEFAULT_SMTP_PORT = 587;

function envString(key, fallback = "") {
    const value = process.env[key];
    if (value == null || String(value).trim() === "") return fallback;
    return String(value).trim();
}

function envNumber(key, fallback) {
    const raw = process.env[key];
    if (raw == null || String(raw).trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function getSmtpPort() {
    return envNumber("SMTP_PORT", DEFAULT_SMTP_PORT);
}

function getMailTimeouts() {
    return {
        connectionTimeout: envNumber("SMTP_CONNECTION_TIMEOUT_MS", 10_000),
        greetingTimeout: envNumber("SMTP_GREETING_TIMEOUT_MS", 10_000),
        socketTimeout: envNumber("SMTP_SOCKET_TIMEOUT_MS", 15_000),
        sendTimeout: envNumber("MAIL_SEND_TIMEOUT_MS", 15_000),
        verifyTimeout: envNumber("MAIL_VERIFY_TIMEOUT_MS", 10_000),
    };
}

function isRenderEnvironment() {
    return Boolean(process.env.RENDER);
}

function getAppBaseUrl() {
    const configured = envString("APP_BASE_URL");
    if (configured) return configured.replace(/\/$/, "");
    const port = envNumber("PORT", 3000);
    return `http://localhost:${port}`;
}

function getBrevoApiKey() {
    return envString("BREVO_API_KEY");
}

function hasSmtpCredentials() {
    return Boolean(envString("SMTP_USER") && envString("SMTP_PASS"));
}

function getMailTransportMode() {
    const explicit = envString("MAIL_TRANSPORT", "auto").toLowerCase();
    if (explicit === "api" || explicit === "brevo-api") return "api";
    if (explicit === "smtp") return "smtp";
    if (getBrevoApiKey()) return "api";
    if (hasSmtpCredentials()) return "smtp";
    return "none";
}

function getSmtpOptions() {
    const port = getSmtpPort();
    const secure = port === 465;
    const timeouts = getMailTimeouts();

    return {
        host: envString("SMTP_HOST", DEFAULT_SMTP_HOST),
        port,
        secure,
        requireTLS: !secure && port === 587,
        auth: {
            user: envString("SMTP_USER"),
            pass: envString("SMTP_PASS"),
        },
        connectionTimeout: timeouts.connectionTimeout,
        greetingTimeout: timeouts.greetingTimeout,
        socketTimeout: timeouts.socketTimeout,
        tls: {
            minVersion: "TLSv1.2",
            rejectUnauthorized: true,
        },
    };
}

function getSenderConfig() {
    const smtpUser = envString("SMTP_USER");
    return {
        fromEmail: envString("SMTP_FROM_EMAIL", smtpUser),
        fromName: envString("SMTP_FROM_NAME", "INFINITY Total-Com Solutions"),
    };
}

function getDiagnostics() {
    const port = getSmtpPort();
    const mode = getMailTransportMode();
    return {
        transport: mode,
        renderEnvironment: isRenderEnvironment(),
        brevoApiKeyPresent: Boolean(getBrevoApiKey()),
        smtpHost: envString("SMTP_HOST", DEFAULT_SMTP_HOST),
        smtpPort: port,
        smtpSecure: port === 465,
        smtpRequireTls: port === 587,
        smtpCredentialsPresent: hasSmtpCredentials(),
        smtpFromEmailPresent: Boolean(getSenderConfig().fromEmail),
        appBaseUrl: getAppBaseUrl(),
        emailLogoUrlPresent: Boolean(envString("EMAIL_LOGO_URL")),
        timeouts: getMailTimeouts(),
    };
}

function isMailConfigured() {
    return getMailTransportMode() !== "none";
}

module.exports = {
    DEFAULT_SMTP_HOST,
    DEFAULT_SMTP_PORT,
    getAppBaseUrl,
    getBrevoApiKey,
    getDiagnostics,
    getMailTimeouts,
    getMailTransportMode,
    getSenderConfig,
    getSmtpOptions,
    getSmtpPort,
    hasSmtpCredentials,
    isMailConfigured,
    isRenderEnvironment,
    envString,
};
