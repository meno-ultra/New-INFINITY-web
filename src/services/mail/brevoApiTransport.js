const {
    getBrevoApiKey,
    getMailTimeouts,
    getSenderConfig,
} = require("./mailConfig");
const { withTimeout } = require("./smtpTransport");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_ACCOUNT_URL = "https://api.brevo.com/v3/account";

function getApiHeaders() {
    const apiKey = getBrevoApiKey();
    if (!apiKey) {
        throw new Error("BREVO_API_KEY is not configured");
    }
    return {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
    };
}

async function brevoApiRequest(url, options = {}) {
    const { sendTimeout } = getMailTimeouts();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), sendTimeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        const text = await response.text();
        let body = {};
        try {
            body = text ? JSON.parse(text) : {};
        } catch (_err) {
            body = { message: text };
        }

        if (!response.ok) {
            const err = new Error(body.message || body.error || `Brevo API error (${response.status})`);
            err.status = response.status;
            err.code = "BREVO_API_ERROR";
            err.details = body;
            throw err;
        }

        return body;
    } catch (err) {
        if (err.name === "AbortError") {
            const timeoutErr = new Error(`Brevo API request timed out after ${sendTimeout}ms`);
            timeoutErr.code = "MAIL_TIMEOUT";
            throw timeoutErr;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function verifyBrevoApi() {
    await brevoApiRequest(BREVO_ACCOUNT_URL, {
        method: "GET",
        headers: getApiHeaders(),
    });
    return true;
}

async function sendViaBrevoApi({ to, subject, html, text }) {
    const { fromEmail, fromName } = getSenderConfig();
    if (!fromEmail) {
        throw new Error("SMTP_FROM_EMAIL or SMTP_USER must be set for the sender address");
    }

    const payload = {
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
    };

    await brevoApiRequest(BREVO_API_URL, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify(payload),
    });
}

module.exports = {
    sendViaBrevoApi,
    verifyBrevoApi,
};
