/**
 * Shared password recovery frontend helpers.
 */
(function (global) {
    if (global.PasswordResetUI) return;

    const STORAGE_EMAIL = "pr_email";
    const STORAGE_EXPIRES = "pr_expires_at";
    const STORAGE_TOKEN = "pr_reset_token";

    function normalizeEmail(email) {
        return String(email || "").trim().toLowerCase();
    }

    function setRecoveryEmail(email) {
        sessionStorage.setItem(STORAGE_EMAIL, normalizeEmail(email));
    }

    function getRecoveryEmail() {
        return sessionStorage.getItem(STORAGE_EMAIL) || "";
    }

    function setExpiresAt(iso) {
        if (iso) sessionStorage.setItem(STORAGE_EXPIRES, iso);
    }

    function getExpiresAt() {
        return sessionStorage.getItem(STORAGE_EXPIRES) || "";
    }

    function setResetToken(token) {
        if (token) sessionStorage.setItem(STORAGE_TOKEN, token);
    }

    function getResetToken() {
        return sessionStorage.getItem(STORAGE_TOKEN) || "";
    }

    function clearRecoverySession() {
        sessionStorage.removeItem(STORAGE_EMAIL);
        sessionStorage.removeItem(STORAGE_EXPIRES);
        sessionStorage.removeItem(STORAGE_TOKEN);
    }

    function showMessage(el, text, type) {
        if (!el) return;
        el.textContent = text || "";
        el.className = `pr-msg visible ${type || "error"}`;
        el.setAttribute("role", "alert");
        if (type === "error") {
            el.classList.add("shake");
            setTimeout(() => el.classList.remove("shake"), 450);
        }
    }

    function hideMessage(el) {
        if (!el) return;
        el.textContent = "";
        el.className = "pr-msg";
        el.removeAttribute("role");
    }

    async function apiPost(path, body) {
        const res = await fetch(path, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {}),
        });
        let data = {};
        try {
            data = await res.json();
        } catch (_e) {
            data = {};
        }
        if (!res.ok) {
            const err = new Error(data.error || "Request failed");
            err.code = data.code;
            err.status = res.status;
            throw err;
        }
        return data;
    }

    function formatCountdown(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    }

    function initOtpInputs(container, onComplete) {
        const inputs = [...container.querySelectorAll(".pr-otp-box")];
        if (!inputs.length) return { getValue: () => "", clear: () => {} };

        const getValue = () => inputs.map((i) => i.value).join("");

        const clear = () => {
            inputs.forEach((i) => {
                i.value = "";
                i.classList.remove("is-invalid");
            });
            inputs[0]?.focus();
        };

        inputs.forEach((input, idx) => {
            input.setAttribute("inputmode", "numeric");
            input.setAttribute("autocomplete", idx === 0 ? "one-time-code" : "off");
            input.setAttribute("maxlength", "1");
            input.setAttribute("aria-label", `Digit ${idx + 1} of 6`);

            input.addEventListener("input", () => {
                input.value = input.value.replace(/\D/g, "").slice(0, 1);
                input.classList.remove("is-invalid");
                if (input.value && idx < inputs.length - 1) {
                    inputs[idx + 1].focus();
                }
                if (getValue().length === 6 && typeof onComplete === "function") {
                    onComplete(getValue());
                }
            });

            input.addEventListener("keydown", (e) => {
                if (e.key === "Backspace" && !input.value && idx > 0) {
                    inputs[idx - 1].focus();
                    inputs[idx - 1].value = "";
                }
                if (e.key === "ArrowLeft" && idx > 0) inputs[idx - 1].focus();
                if (e.key === "ArrowRight" && idx < inputs.length - 1) inputs[idx + 1].focus();
            });

            input.addEventListener("paste", (e) => {
                e.preventDefault();
                const pasted = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
                if (!pasted) return;
                pasted.split("").forEach((ch, i) => {
                    if (inputs[i]) inputs[i].value = ch;
                });
                const next = Math.min(pasted.length, inputs.length - 1);
                inputs[next]?.focus();
                if (pasted.length === 6 && typeof onComplete === "function") {
                    onComplete(getValue());
                }
            });
        });

        inputs[0]?.focus();
        return { getValue, clear, inputs };
    }

    function startExpiryTimer({ expiresAtIso, timerEl, verifyBtn, onExpired }) {
        const end = expiresAtIso ? new Date(expiresAtIso).getTime() : Date.now() + 10 * 60 * 1000;

        const tick = () => {
            const remaining = end - Date.now();
            if (remaining <= 0) {
                if (timerEl) {
                    timerEl.innerHTML = '<span class="expired">Code expired</span>';
                    timerEl.classList.add("expired");
                }
                if (verifyBtn) verifyBtn.disabled = true;
                if (typeof onExpired === "function") onExpired();
                return;
            }
            if (timerEl) {
                timerEl.innerHTML = `Code expires in <strong>${formatCountdown(remaining)}</strong>`;
                timerEl.classList.remove("expired");
            }
            if (verifyBtn) verifyBtn.disabled = false;
            setTimeout(tick, 1000);
        };

        tick();
        return () => {};
    }

    function startResendCooldown(btn, seconds, labelEl) {
        let left = seconds;
        btn.disabled = true;
        const base = btn.dataset.baseLabel || btn.textContent;

        const tick = () => {
            if (left <= 0) {
                btn.disabled = false;
                btn.textContent = base;
                if (labelEl) labelEl.textContent = "";
                return;
            }
            btn.textContent = `Resend in ${left}s`;
            if (labelEl) labelEl.textContent = `You can resend in ${left} seconds`;
            left -= 1;
            setTimeout(tick, 1000);
        };

        tick();
    }

    function syncPasswordToggle(btn, input) {
        const hidden = input.type === "password";
        btn.innerHTML = hidden ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        btn.setAttribute("aria-label", hidden ? "Show password" : "Hide password");
    }

    function wirePasswordToggles(root) {
        (root || document).querySelectorAll(".toggle-password").forEach((btn) => {
            const target = document.getElementById(btn.getAttribute("data-target"));
            if (!target) return;
            syncPasswordToggle(btn, target);
            btn.addEventListener("click", () => {
                target.type = target.type === "password" ? "text" : "password";
                syncPasswordToggle(btn, target);
            });
        });
    }

    function showResetSuccess(options) {
        const {
            card,
            form,
            successEl,
            redirectMs = 2000,
            redirectUrl = "auth.html?reset=success",
        } = options || {};

        if (card) {
            card.querySelectorAll(".pr-back, .pr-steps, .pr-logo, .pr-title, .pr-sub").forEach((el) => {
                el.classList.add("pr-meta-hidden");
            });
        }
        if (form) form.classList.add("pr-form-hidden");
        if (successEl) {
            successEl.classList.add("is-visible");
            successEl.setAttribute("role", "status");
            successEl.setAttribute("aria-live", "polite");
        }

        clearRecoverySession();

        const redirectLabel = successEl?.querySelector("[data-redirect-countdown]");
        let remaining = Math.ceil(redirectMs / 1000);
        if (redirectLabel) redirectLabel.textContent = String(remaining);

        const tick = setInterval(() => {
            remaining -= 1;
            if (redirectLabel && remaining > 0) redirectLabel.textContent = String(remaining);
            if (remaining <= 0) clearInterval(tick);
        }, 1000);

        setTimeout(() => {
            window.location.href = redirectUrl;
        }, redirectMs);
    }

    const GENERIC_REQUEST_MESSAGE =
        "If an account exists for this email, a verification code has been sent.";

    global.PasswordResetUI = {
        GENERIC_REQUEST_MESSAGE,
        normalizeEmail,
        setRecoveryEmail,
        getRecoveryEmail,
        setExpiresAt,
        getExpiresAt,
        setResetToken,
        getResetToken,
        clearRecoverySession,
        showMessage,
        hideMessage,
        apiPost,
        formatCountdown,
        initOtpInputs,
        startExpiryTimer,
        startResendCooldown,
        wirePasswordToggles,
        showResetSuccess,
    };
})(typeof window !== "undefined" ? window : globalThis);
