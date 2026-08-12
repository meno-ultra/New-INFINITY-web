const nodemailer = require("nodemailer");
const {
    getMailTimeouts,
    getSmtpOptions,
    hasSmtpCredentials,
} = require("./mailConfig");

let transporter = null;

function createSmtpTransporter() {
    if (!hasSmtpCredentials()) {
        throw new Error("SMTP credentials are not configured");
    }
    const options = getSmtpOptions();
    return nodemailer.createTransport(options);
}

function getSmtpTransporter() {
    if (!transporter) {
        transporter = createSmtpTransporter();
    }
    return transporter;
}

function resetSmtpTransporter() {
    transporter = null;
}

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function verifySmtpTransporter() {
    const transport = getSmtpTransporter();
    const { verifyTimeout } = getMailTimeouts();
    const options = getSmtpOptions();

    await withTimeout(
        new Promise((resolve, reject) => {
            transport.verify((err, success) => {
                if (err) reject(err);
                else resolve(success);
            });
        }),
        verifyTimeout,
        `SMTP verify (${options.host}:${options.port})`
    );

    return true;
}

async function sendViaSmtp(message) {
    const transport = getSmtpTransporter();
    const { sendTimeout } = getMailTimeouts();

    await withTimeout(
        transport.sendMail(message),
        sendTimeout,
        "SMTP sendMail"
    );
}

module.exports = {
    createSmtpTransporter,
    getSmtpTransporter,
    resetSmtpTransporter,
    sendViaSmtp,
    verifySmtpTransporter,
    withTimeout,
};
