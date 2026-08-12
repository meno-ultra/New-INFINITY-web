/**
 * Shared client-side form validation for auth and profile pages.
 */
(function (global) {
    if (global.FormValidation) return;

    const MESSAGES = {
        required: '❌ This field is required.',
        fullName: '❌ Please enter your full name using letters only.',
        companyName: '❌ Company name may only contain letters, numbers, spaces, &, -, and .',
        companyLocation: '❌ Company location must be 200 characters or fewer.',
        phone: '❌ Please enter a valid Egyptian mobile number (11 digits).',
        age: '❌ Age must be between 18 and 100.',
        email: '❌ Please enter a valid email address.',
        confirmPassword: '❌ Passwords do not match.'
    };

    const EGYPT_MOBILE_PREFIXES = ['010', '011', '012', '015'];

    function trim(value) {
        return String(value == null ? '' : value).trim();
    }

    function validateFullName(value) {
        const v = trim(value);
        if (!v) return { valid: false, message: MESSAGES.required };
        if (!/^[A-Za-z]+(?:\s+[A-Za-z]+)+$/.test(v)) {
            return { valid: false, message: MESSAGES.fullName };
        }
        const parts = v.split(/\s+/);
        if (parts.some((part) => part.length < 2) || v.length < 5) {
            return { valid: false, message: MESSAGES.fullName };
        }
        return { valid: true };
    }

    function validateCompanyName(value, required) {
        const v = trim(value);
        if (!v) return required ? { valid: false, message: MESSAGES.required } : { valid: true };
        if (!/^[A-Za-z0-9\s&\-.]+$/.test(v) || v.length < 2) {
            return { valid: false, message: MESSAGES.companyName };
        }
        return { valid: true };
    }

    function validateCompanyLocation(value, required) {
        const v = trim(value);
        if (!v) return required ? { valid: false, message: MESSAGES.required } : { valid: true };
        if (v.length > 200) {
            return { valid: false, message: MESSAGES.companyLocation };
        }
        return { valid: true };
    }

    function getCompleteProfileAccountType(form) {
        const checked = form?.querySelector('input[name="cp-account-type"]:checked');
        return checked?.value === 'company' ? 'company' : 'personal';
    }

    function validateEgyptPhone(value) {
        const v = trim(value).replace(/\D/g, '');
        if (!v) return { valid: false, message: MESSAGES.required };
        if (v.length !== 11) return { valid: false, message: MESSAGES.phone };
        const prefix = v.slice(0, 3);
        if (!EGYPT_MOBILE_PREFIXES.includes(prefix)) {
            return { valid: false, message: MESSAGES.phone };
        }
        return { valid: true, normalized: v };
    }

    function validateAge(value, required) {
        const raw = trim(value);
        if (!raw) return required ? { valid: false, message: MESSAGES.required } : { valid: true };
        if (!/^\d+$/.test(raw)) return { valid: false, message: MESSAGES.age };
        const n = Number(raw);
        if (n < 18 || n > 100) return { valid: false, message: MESSAGES.age };
        return { valid: true, normalized: n };
    }

    function validateEmail(value) {
        const v = trim(value);
        if (!v) return { valid: false, message: MESSAGES.required };
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!emailRe.test(v)) return { valid: false, message: MESSAGES.email };
        return { valid: true };
    }

    function getPasswordChecks(value) {
        return {
            length: value.length >= 8,
            upper: /[A-Z]/.test(value),
            lower: /[a-z]/.test(value),
            number: /\d/.test(value),
            special: /[^A-Za-z0-9]/.test(value)
        };
    }

    function isPrimaryPasswordInput(input) {
        if (!input || input.type !== 'password') return false;
        const id = input.id || '';
        return id.includes('password') && !id.includes('confirm');
    }

    function validatePassword(value) {
        const v = String(value || '');
        if (!v) return { valid: false, message: MESSAGES.required };
        const checks = getPasswordChecks(v);
        if (!checks.length || !checks.upper || !checks.lower || !checks.number || !checks.special) {
            return { valid: false };
        }
        return { valid: true };
    }

    function validateConfirmPassword(password, confirm) {
        if (!trim(confirm)) return { valid: false, message: MESSAGES.required };
        if (password !== confirm) return { valid: false, message: MESSAGES.confirmPassword };
        return { valid: true };
    }

    function validateSelect(value) {
        if (!trim(value)) return { valid: false, message: MESSAGES.required };
        return { valid: true };
    }

    function getFieldContainer(input) {
        return input.closest('.form-group, .cp-group, .pr-group') || input.parentElement;
    }

    function ensureErrorElement(input) {
        const container = getFieldContainer(input);
        if (!container) return null;
        let el = container.querySelector('.field-error');
        if (!el) {
            el = document.createElement('div');
            el.className = 'field-error';
            el.setAttribute('role', 'alert');
            const passwordField = input.closest('.password-field');
            if (passwordField) {
                passwordField.insertAdjacentElement('afterend', el);
            } else {
                input.insertAdjacentElement('afterend', el);
            }
        }
        return el;
    }

    function setFieldError(input, message) {
        if (!input) return;
        const container = getFieldContainer(input);
        const passwordField = isPrimaryPasswordInput(input);
        const errorEl = passwordField ? null : ensureErrorElement(input);
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        if (container) container.classList.add('has-error');
        if (passwordField) {
            const stray = container && container.querySelector('.field-error');
            if (stray) {
                stray.textContent = '';
                stray.classList.remove('visible');
            }
            return;
        }
        if (errorEl) {
            errorEl.textContent = message || '';
            errorEl.classList.add('visible');
        }
    }

    function clearFieldError(input) {
        if (!input) return;
        const container = getFieldContainer(input);
        const errorEl = container && container.querySelector('.field-error');
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
        if (container) container.classList.remove('has-error');
        if (errorEl && !isPrimaryPasswordInput(input)) {
            errorEl.textContent = '';
            errorEl.classList.remove('visible');
        }
    }

    function sanitizePhoneInput(input) {
        const digits = input.value.replace(/\D/g, '').slice(0, 11);
        if (input.value !== digits) input.value = digits;
    }

    function sanitizeAgeInput(input) {
        const digits = input.value.replace(/\D/g, '').slice(0, 3);
        if (input.value !== digits) input.value = digits;
    }

    function sanitizeFullNameInput(input) {
        const cleaned = input.value.replace(/[^A-Za-z\s]/g, '').replace(/\s{2,}/g, ' ');
        if (input.value !== cleaned) input.value = cleaned;
    }

    function sanitizeCompanyNameInput(input) {
        const cleaned = input.value.replace(/[^A-Za-z0-9\s&\-.]/g, '');
        if (input.value !== cleaned) input.value = cleaned;
    }

    function sanitizeCompanyLocationInput(input) {
        if (input.value.length > 200) input.value = input.value.slice(0, 200);
    }

    function updatePasswordRequirements(passwordInput, requirementsEl) {
        if (!requirementsEl || !passwordInput) return;
        const value = passwordInput.value;
        const checks = getPasswordChecks(value);
        const hasInput = value.length > 0;
        requirementsEl.querySelectorAll('[data-rule]').forEach((item) => {
            const rule = item.getAttribute('data-rule');
            const ok = checks[rule];
            item.classList.remove('pending', 'met', 'fail');
            if (!hasInput) {
                item.classList.add('pending');
            } else if (ok) {
                item.classList.add('met');
            } else {
                item.classList.add('fail');
            }
        });
    }

    function bindField(input, validateFn, options) {
        if (!input) return;
        const { onInput, liveConfirmTarget } = options || {};

        const run = () => {
            const result = validateFn();
            if (result.valid) {
                clearFieldError(input);
            } else if (isPrimaryPasswordInput(input)) {
                setFieldError(input);
            } else if (result.message) {
                setFieldError(input, result.message);
            }
            if (typeof onInput === 'function') onInput(result);
            if (liveConfirmTarget) {
                const confirmInput = liveConfirmTarget;
                const confirmResult = validateConfirmPassword(input.value, confirmInput.value);
                if (!confirmResult.valid && trim(confirmInput.value)) {
                    setFieldError(confirmInput, confirmResult.message);
                } else if (confirmResult.valid) {
                    clearFieldError(confirmInput);
                }
            }
            return result.valid;
        };

        const onEdit = () => {
            if (input.id && input.id.includes('phone')) sanitizePhoneInput(input);
            if (input.type === 'number' || (input.id && input.id.includes('age'))) sanitizeAgeInput(input);
            if (input.id && input.id.includes('name') && !input.id.includes('company')) sanitizeFullNameInput(input);
            if (input.id && input.id.includes('company-name')) sanitizeCompanyNameInput(input);
            if (input.id && input.id.includes('company-location')) sanitizeCompanyLocationInput(input);
            run();
        };

        input.addEventListener('input', onEdit);
        input.addEventListener('change', onEdit);
        input.addEventListener('blur', run);
        return run;
    }

    function getSignupAccountType(form) {
        const checked = form?.querySelector('input[name="account-type"]:checked');
        return checked?.value === 'company' ? 'company' : 'personal';
    }

    function validateDateOfBirth(value, required) {
        const v = trim(value);
        if (!v) return required ? { valid: false, message: MESSAGES.required } : { valid: true };
        const birth = new Date(v);
        if (Number.isNaN(birth.getTime())) {
            return { valid: false, message: '❌ Please enter a valid date of birth.' };
        }
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
        if (age < 18 || age > 100) return { valid: false, message: MESSAGES.age };
        return { valid: true, normalized: age };
    }

    function runFieldChecks(checks, fields, form) {
        let firstInvalid = null;
        checks.forEach((result, i) => {
            const input = fields[i];
            if (!input) return;
            if (!result.valid) {
                if (isPrimaryPasswordInput(input)) {
                    setFieldError(input);
                    updatePasswordRequirements(input, form?.querySelector('.password-requirements'));
                } else {
                    setFieldError(input, result.message);
                }
                if (!firstInvalid) firstInvalid = input;
            } else {
                clearFieldError(input);
            }
        });
        if (firstInvalid) {
            firstInvalid.focus();
            return false;
        }
        return true;
    }

    function validateSignupForm(form) {
        const accountType = getSignupAccountType(form);
        const checks = [];
        const fields = [];

        if (accountType === 'personal') {
            checks.push(validateFullName(form.querySelector('#signup-name')?.value || ''));
            fields.push(form.querySelector('#signup-name'));
            checks.push(validateEgyptPhone(form.querySelector('#signup-phone')?.value || ''));
            fields.push(form.querySelector('#signup-phone'));
            checks.push(validateAge(form.querySelector('#signup-age')?.value, true));
            fields.push(form.querySelector('#signup-age'));
            checks.push(validateSelect(form.querySelector('#signup-gender')?.value));
            fields.push(form.querySelector('#signup-gender'));
            checks.push(validateSelect(form.querySelector('#signup-state')?.value));
            fields.push(form.querySelector('#signup-state'));
            const city = form.querySelector('#signup-city');
            const address = form.querySelector('#signup-address');
            checks.push(trim(city?.value) ? { valid: true } : { valid: false, message: MESSAGES.required });
            fields.push(city);
            checks.push(trim(address?.value) ? { valid: true } : { valid: false, message: MESSAGES.required });
            fields.push(address);
            checks.push(validateDateOfBirth(form.querySelector('#signup-dob')?.value, false));
            fields.push(form.querySelector('#signup-dob'));
        } else {
            checks.push(validateCompanyName(form.querySelector('#signup-company-name-req')?.value, true));
            fields.push(form.querySelector('#signup-company-name-req'));
            checks.push(validateFullName(form.querySelector('#signup-contact-person')?.value || ''));
            fields.push(form.querySelector('#signup-contact-person'));
            checks.push(validateEgyptPhone(form.querySelector('#signup-company-phone')?.value || ''));
            fields.push(form.querySelector('#signup-company-phone'));
            const city = form.querySelector('#signup-company-city');
            const address = form.querySelector('#signup-company-address');
            checks.push(trim(city?.value) ? { valid: true } : { valid: false, message: MESSAGES.required });
            fields.push(city);
            checks.push(trim(address?.value) ? { valid: true } : { valid: false, message: MESSAGES.required });
            fields.push(address);
            checks.push(validateSelect(form.querySelector('#signup-company-state')?.value));
            fields.push(form.querySelector('#signup-company-state'));
        }

        const password = form.querySelector('#signup-password');
        const confirm = form.querySelector('#signup-confirm-password');
        checks.push(validateEmail(form.querySelector('#signup-email')?.value || ''));
        fields.push(form.querySelector('#signup-email'));
        checks.push(validatePassword(password?.value || ''));
        fields.push(password);
        checks.push(validateConfirmPassword(password?.value || '', confirm?.value || ''));
        fields.push(confirm);

        return runFieldChecks(checks, fields, form);
    }

    function validateCompleteProfileForm(form) {
        const isCompany = getCompleteProfileAccountType(form) === 'company';
        const phone = form.querySelector('#cp-phone');
        const state = form.querySelector('#cp-state');
        const companyName = form.querySelector('#cp-company-name');
        const companyLocation = form.querySelector('#cp-company-location');
        const password = form.querySelector('#cp-password');
        const confirm = form.querySelector('#cp-confirm-password');

        const checks = [
            validateEgyptPhone(phone.value),
            validateSelect(state.value),
        ];
        const fields = [phone, state];

        if (isCompany) {
            checks.push(
                validateCompanyName(companyName.value, true),
                validateCompanyLocation(companyLocation ? companyLocation.value : '', true)
            );
            fields.push(companyName, companyLocation);
        }

        checks.push(
            validatePassword(password.value),
            validateConfirmPassword(password.value, confirm.value)
        );
        fields.push(password, confirm);

        let firstInvalid = null;

        checks.forEach((result, i) => {
            const input = fields[i];
            if (!result.valid) {
                if (isPrimaryPasswordInput(input)) {
                    setFieldError(input);
                    updatePasswordRequirements(input, form.querySelector('.password-requirements'));
                } else {
                    setFieldError(input, result.message);
                }
                if (!firstInvalid) firstInvalid = input;
            } else {
                clearFieldError(input);
            }
        });

        if (firstInvalid) {
            firstInvalid.focus();
            return false;
        }
        return true;
    }

    function attachSignupValidation(form) {
        if (!form) return;

        const name = form.querySelector('#signup-name');
        const age = form.querySelector('#signup-age');
        const contactPerson = form.querySelector('#signup-contact-person');
        const phone = form.querySelector('#signup-phone');
        const dob = form.querySelector('#signup-dob');
        const gender = form.querySelector('#signup-gender');
        const state = form.querySelector('#signup-state');
        const companyName = form.querySelector('#signup-company-name-req');
        const companyPhone = form.querySelector('#signup-company-phone');
        const companyAddress = form.querySelector('#signup-company-address');
        const companyCity = form.querySelector('#signup-company-city');
        const companyState = form.querySelector('#signup-company-state');
        const address = form.querySelector('#signup-address');
        const city = form.querySelector('#signup-city');
        const email = form.querySelector('#signup-email');
        const password = form.querySelector('#signup-password');
        const confirm = form.querySelector('#signup-confirm-password');

        if (phone) {
            phone.setAttribute('maxlength', '11');
            phone.setAttribute('inputmode', 'numeric');
            phone.setAttribute('autocomplete', 'tel');
        }

        let requirementsEl = form.querySelector('.password-requirements');
        if (!requirementsEl && password) {
            requirementsEl = document.createElement('div');
            requirementsEl.className = 'password-requirements password-requirements--signup';
            requirementsEl.innerHTML = [
                '<p class="password-requirements-title">Password must include:</p>',
                '<ul>',
                '<li class="pending" data-rule="length">8+ characters</li>',
                '<li class="pending" data-rule="upper">One uppercase letter</li>',
                '<li class="pending" data-rule="lower">One lowercase letter</li>',
                '<li class="pending" data-rule="number">One number</li>',
                '<li class="pending" data-rule="special">One special character</li>',
                '</ul>'
            ].join('');
            const passwordGroup = password.closest('.form-group');
            if (passwordGroup) passwordGroup.appendChild(requirementsEl);
        }

        if (password && requirementsEl) {
            requirementsEl.classList.add('password-requirements--signup', 'is-visible');
            updatePasswordRequirements(password, requirementsEl);
        }

        bindField(name, () => (getSignupAccountType(form) === 'personal' ? validateFullName(name.value) : { valid: true }));
        bindField(age, () => (getSignupAccountType(form) === 'personal' ? validateAge(age.value, true) : { valid: true }));
        bindField(contactPerson, () => (getSignupAccountType(form) === 'company' ? validateFullName(contactPerson.value) : { valid: true }));
        bindField(phone, () => (getSignupAccountType(form) === 'personal' ? validateEgyptPhone(phone.value) : { valid: true }));
        bindField(dob, () => (getSignupAccountType(form) === 'personal' ? validateDateOfBirth(dob.value, false) : { valid: true }));
        bindField(gender, () => (getSignupAccountType(form) === 'personal' ? validateSelect(gender.value) : { valid: true }));
        bindField(state, () => (getSignupAccountType(form) === 'personal' ? validateSelect(state.value) : { valid: true }));
        bindField(companyName, () => validateCompanyName(companyName?.value, getSignupAccountType(form) === 'company'));
        bindField(companyPhone, () => (getSignupAccountType(form) === 'company' ? validateEgyptPhone(companyPhone.value) : { valid: true }));
        bindField(address, () => (getSignupAccountType(form) === 'personal' && !trim(address?.value) ? { valid: false, message: MESSAGES.required } : { valid: true }));
        bindField(city, () => (getSignupAccountType(form) === 'personal' && !trim(city?.value) ? { valid: false, message: MESSAGES.required } : { valid: true }));
        bindField(companyAddress, () => (getSignupAccountType(form) === 'company' && !trim(companyAddress?.value) ? { valid: false, message: MESSAGES.required } : { valid: true }));
        bindField(companyCity, () => (getSignupAccountType(form) === 'company' && !trim(companyCity?.value) ? { valid: false, message: MESSAGES.required } : { valid: true }));
        bindField(companyState, () => (getSignupAccountType(form) === 'company' ? validateSelect(companyState?.value) : { valid: true }));
        bindField(email, () => validateEmail(email.value));
        bindField(password, () => validatePassword(password.value), {
            onInput: () => updatePasswordRequirements(password, requirementsEl),
            liveConfirmTarget: confirm
        });
        bindField(confirm, () => validateConfirmPassword(password.value, confirm.value));

        if (address) address.setAttribute('maxlength', '200');
        if (companyAddress) companyAddress.setAttribute('maxlength', '200');
        if (companyPhone) {
            companyPhone.setAttribute('maxlength', '11');
            companyPhone.setAttribute('inputmode', 'numeric');
        }
    }

    function attachCompleteProfileValidation(form) {
        if (!form) return;

        const phone = form.querySelector('#cp-phone');
        const state = form.querySelector('#cp-state');
        const companyName = form.querySelector('#cp-company-name');
        const companyLocation = form.querySelector('#cp-company-location');
        const password = form.querySelector('#cp-password');
        const confirm = form.querySelector('#cp-confirm-password');

        if (phone) {
            phone.setAttribute('maxlength', '11');
            phone.setAttribute('inputmode', 'numeric');
            phone.setAttribute('autocomplete', 'tel');
        }
        if (companyLocation) {
            companyLocation.setAttribute('maxlength', '200');
        }

        let requirementsEl = form.querySelector('.password-requirements');
        if (!requirementsEl && password) {
            requirementsEl = document.createElement('div');
            requirementsEl.className = 'password-requirements password-requirements--profile is-visible';
            requirementsEl.innerHTML = [
                '<p class="password-requirements-title">Password must include:</p>',
                '<ul>',
                '<li class="pending" data-rule="length">At least 8 characters</li>',
                '<li class="pending" data-rule="upper">One uppercase letter</li>',
                '<li class="pending" data-rule="lower">One lowercase letter</li>',
                '<li class="pending" data-rule="number">One number</li>',
                '<li class="pending" data-rule="special">One special character</li>',
                '</ul>'
            ].join('');
            const passwordGroup = password.closest('.cp-group');
            if (passwordGroup) passwordGroup.appendChild(requirementsEl);
        }

        if (requirementsEl) {
            requirementsEl.classList.add('password-requirements--profile', 'is-visible');
        }

        bindField(phone, () => validateEgyptPhone(phone.value));
        bindField(state, () => validateSelect(state.value));
        if (companyName) {
            bindField(companyName, () => validateCompanyName(companyName.value, getCompleteProfileAccountType(form) === 'company'));
        }
        if (companyLocation) {
            bindField(companyLocation, () => validateCompanyLocation(companyLocation.value, getCompleteProfileAccountType(form) === 'company'));
        }
        bindField(password, () => validatePassword(password.value), {
            onInput: () => updatePasswordRequirements(password, requirementsEl),
            liveConfirmTarget: confirm
        });
        bindField(confirm, () => validateConfirmPassword(password.value, confirm.value));

        form.querySelectorAll('input[name="cp-account-type"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                const isCompany = getCompleteProfileAccountType(form) === 'company';
                if (companyName) {
                    companyName.required = isCompany;
                    if (!isCompany) clearFieldError(companyName);
                }
                if (companyLocation) {
                    companyLocation.required = isCompany;
                    if (!isCompany) clearFieldError(companyLocation);
                }
            });
        });

        updatePasswordRequirements(password, requirementsEl);
    }

    function attachForgotEmailValidation(form) {
        if (!form) return;
        const email = form.querySelector('#forgot-email');
        if (!email) return;
        bindField(email, () => validateEmail(email.value));
    }

    function attachResetPasswordValidation(form) {
        if (!form) return;
        const password = form.querySelector('#reset-password');
        const confirm = form.querySelector('#reset-confirm');
        if (!password || !confirm) return;

        let requirementsEl = form.querySelector('.password-requirements');
        bindField(password, () => validatePassword(password.value), {
            onInput: () => updatePasswordRequirements(password, requirementsEl),
            liveConfirmTarget: confirm,
        });
        bindField(confirm, () => validateConfirmPassword(password.value, confirm.value));
        updatePasswordRequirements(password, requirementsEl);
    }

    function validateResetPasswordForm(form) {
        if (!form) return false;
        const password = form.querySelector('#reset-password');
        const confirm = form.querySelector('#reset-confirm');
        let ok = true;
        if (!validatePassword(password.value).valid) {
            setFieldError(password);
            ok = false;
        }
        const confirmResult = validateConfirmPassword(password.value, confirm.value);
        if (!confirmResult.valid) {
            setFieldError(confirm, confirmResult.message);
            ok = false;
        }
        return ok;
    }

    global.FormValidation = {
        MESSAGES,
        validateFullName,
        validateCompanyName,
        validateCompanyLocation,
        validateEgyptPhone,
        validateAge,
        validateEmail,
        validatePassword,
        validateConfirmPassword,
        getPasswordChecks,
        updatePasswordRequirements,
        setFieldError,
        clearFieldError,
        validateDateOfBirth,
        validateSignupForm,
        attachSignupValidation,
        attachCompleteProfileValidation,
        attachForgotEmailValidation,
        attachResetPasswordValidation,
        validateCompleteProfileForm,
        validateResetPasswordForm
    };
})(typeof window !== 'undefined' ? window : globalThis);
