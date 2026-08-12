const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isLowPowerDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;

// Keep lightweight scroll progress only on capable devices
if (!reduceMotion && !isLowPowerDevice) {
    const scrollProgress = document.createElement('div');
    scrollProgress.className = 'scroll-progress';
    document.body.appendChild(scrollProgress);

    let progressTicking = false;
    window.addEventListener('scroll', () => {
        if (progressTicking) return;
        progressTicking = true;
        window.requestAnimationFrame(() => {
            const windowHeight = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
            const scrolled = (window.scrollY / windowHeight) * 100;
            scrollProgress.style.transform = `scaleX(${scrolled / 100})`;
            progressTicking = false;
        });
    }, { passive: true });
}

// Faster Scroll Reveal Animation
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
};

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

/** Bind scroll-reveal to team cards (including members injected after fetch on team.html). */
function bindScrollReveal(root) {
    const scope = root || document;
    scope.querySelectorAll('.team-member').forEach((member, index) => {
        if (member.dataset.revealBound) return;
        member.dataset.revealBound = '1';
        if (!member.classList.contains('slide-in-left') && !member.classList.contains('slide-in-right')) {
            member.classList.add(index % 2 === 0 ? 'slide-in-left' : 'slide-in-right');
            member.dataset.delay = index * 120;
        }
        revealObserver.observe(member);
        requestAnimationFrame(() => {
            const rect = member.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                member.classList.add('visible');
            }
        });
    });
    scope.querySelectorAll('.team-category-block').forEach((block, index) => {
        if (block.dataset.revealBound) return;
        block.dataset.revealBound = '1';
        block.classList.add('fade-in');
        block.dataset.delay = index * 80;
        revealObserver.observe(block);
        requestAnimationFrame(() => {
            const rect = block.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                block.classList.add('visible');
            }
        });
    });
}

window.bindScrollReveal = bindScrollReveal;

// Add animation classes with faster staggered delays
document.addEventListener('DOMContentLoaded', () => {
    // Faster initial paint for images (lazy load offscreen)
    document.querySelectorAll('img').forEach((img) => {
        const isHeroLogo = img.classList.contains('hero-logo-image') || img.classList.contains('logo-image');
        img.decoding = 'async';
        if (!isHeroLogo) {
            img.loading = 'lazy';
            img.fetchPriority = 'low';
        } else {
            img.loading = 'eager';
            img.fetchPriority = 'high';
        }
    });

    // Sections with faster fade-in (skip dashboard modals/dialogs)
    document.querySelectorAll('section').forEach((section, index) => {
        if (section.closest('.product-edit-modal, .dash-dialog, .product-edit-dialog')) return;
        section.classList.add('fade-in');
        section.dataset.delay = index * 80; // Reduced from 150
        revealObserver.observe(section);
    });

    // Feature cards with faster alternating slide-in
    document.querySelectorAll('.feature-card').forEach((card, index) => {
        card.classList.add(index % 2 === 0 ? 'slide-in-left' : 'slide-in-right');
        card.dataset.delay = index * 100; // Reduced from 200
        revealObserver.observe(card);
    });

    // Pricing cards with faster scale-in
    document.querySelectorAll('.pricing-card').forEach((card, index) => {
        card.classList.add('scale-in');
        card.dataset.delay = index * 120; // Reduced from 250
        revealObserver.observe(card);
    });

    // Testimonials with faster fade-in
    document.querySelectorAll('.testimonial-card').forEach((card, index) => {
        card.classList.add('fade-in');
        card.dataset.delay = index * 100; // Reduced from 200
        revealObserver.observe(card);
    });

    bindScrollReveal(document);

    // Value cards with faster scale-in
    document.querySelectorAll('.value-card').forEach((card, index) => {
        card.classList.add('scale-in');
        card.dataset.delay = index * 100; // Reduced from 200
        revealObserver.observe(card);
    });
    // Disable expensive parallax on low-power/reduced-motion devices
    if (!reduceMotion && !isLowPowerDevice) {
        const hero = document.querySelector('.hero');
        if (hero) {
            let heroTicking = false;
            window.addEventListener('scroll', () => {
                if (heroTicking) return;
                heroTicking = true;
                window.requestAnimationFrame(() => {
                    hero.style.backgroundPositionY = `${window.pageYOffset * 0.2}px`;
                    heroTicking = false;
                });
            }, { passive: true });
        }
    }

    // Faster floating animation for feature icons
    document.querySelectorAll('.feature-card i').forEach(icon => {
        icon.style.animation = 'float 2s ease-in-out infinite'; // Reduced from 3s
    });
});

// Faster smooth scroll with easing
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            // Faster smooth scroll
            const startPosition = window.pageYOffset;
            const distance = offsetPosition - startPosition;
            const duration = 600; // Reduced from 1000
            let start = null;

            function animation(currentTime) {
                if (start === null) start = currentTime;
                const timeElapsed = currentTime - start;
                const run = ease(timeElapsed, startPosition, distance, duration);
                window.scrollTo(0, run);
                if (timeElapsed < duration) requestAnimationFrame(animation);
            }

            function ease(t, b, c, d) {
                t /= d / 2;
                if (t < 1) return c / 2 * t * t + b;
                t--;
                return -c / 2 * (t * (t - 2) - 1) + b;
            }

            requestAnimationFrame(animation);
        }
    });
});

// Faster hover effects
document.querySelectorAll('.cta-primary, .cta-secondary, .pricing-btn, .support-btn').forEach(button => {
    button.addEventListener('mouseenter', function(e) {
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.style.setProperty('--x', `${x}px`);
        this.style.setProperty('--y', `${y}px`);
    });
});

// Removed heavy per-image scroll transform for better rendering performance

// Faster floating animation
const style = document.createElement('style');
style.textContent = `
    @keyframes float {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-8px); }
        100% { transform: translateY(0px); }
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', function() {
    // Get existing menu toggle button and menu
    const menuToggle = document.querySelector('.menu-toggle');
    const menu = document.querySelector('nav:not(.home-quick-nav) ul');
    if (!menuToggle || !menu) return;

    // Handle menu toggle (stopPropagation so document/outside handlers never eat the tap; icon uses pointer-events:none in CSS)
    menuToggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        menu.classList.toggle('active');
        menuToggle.classList.toggle('active');
        
        // Update aria-expanded attribute for accessibility
        const isExpanded = menu.classList.contains('active');
        menuToggle.setAttribute('aria-expanded', isExpanded);
        
        // Animate icon
        menuToggle.innerHTML = isExpanded 
            ? '<i class="fas fa-times"></i>' 
            : '<i class="fas fa-bars"></i>';
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(event) {
        const nav = document.querySelector('nav');
        if (!nav.contains(event.target) && menu.classList.contains('active')) {
            menu.classList.remove('active');
            menuToggle.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        }
    });

    // Close menu when clicking on a link
    menu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            menu.classList.remove('active');
            menuToggle.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        });
    });

    // Close menu on window resize if switching to desktop view (matches CSS hamburger breakpoint)
    window.addEventListener('resize', function() {
        if (window.innerWidth > 992 && menu.classList.contains('active')) {
            menu.classList.remove('active');
            menuToggle.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        }
    });

    // Reveal animations already handled by shared observer above
});

// Auth UI (nav link on inner pages; dropdown on homepage)
function setAuthNavItemVisible(el, visible) {
    if (!el) return;
    if (visible) {
        el.removeAttribute('hidden');
    } else {
        el.setAttribute('hidden', '');
    }
    el.style.removeProperty('display');
}

async function initAuthUI() {
    const authLink = document.querySelector('a.account-link');
    const homeMenu = document.getElementById('home-account-menu');
    const homeToggleLabel = document.querySelector('.home-account-toggle-label');
    const homePanelTitle = document.querySelector('.home-account-panel-title');
    const homeSignInItem = document.querySelector('.home-account-signin-item');
    const homeSignOutItem = document.querySelector('.home-account-signout-item');
    const homeSignOutBtn = document.getElementById('home-account-signout');
    const isHomeDropdown = !!homeMenu;

    if (!authLink && !isHomeDropdown) return;

    function setHomeGuestMode(isGuest) {
        if (!homeMenu) return;
        homeMenu.classList.toggle('is-guest', isGuest);
        homeMenu.dataset.authState = isGuest ? 'guest' : 'signed-in';
    }

    function applyLoggedOut() {
        document.querySelectorAll('.user-orders-link').forEach((el) => {
            setAuthNavItemVisible(el, false);
        });
        document.querySelectorAll('.user-profile-link').forEach((el) => {
            setAuthNavItemVisible(el, false);
        });
        document.querySelectorAll('.user-support-link').forEach((el) => {
            setAuthNavItemVisible(el, false);
        });
        document.querySelectorAll('.staff-dashboard-link').forEach((el) => {
            setAuthNavItemVisible(el, false);
        });
        if (authLink && !isHomeDropdown) {
            authLink.href = 'auth.html';
            authLink.innerHTML = '<i class="fas fa-user"></i> Sign In';
        }
        if (isHomeDropdown) {
            setHomeGuestMode(true);
            if (homeToggleLabel) homeToggleLabel.textContent = 'Sign In';
            if (homePanelTitle) homePanelTitle.textContent = '';
            setAuthNavItemVisible(homeSignInItem, false);
            setAuthNavItemVisible(homeSignOutItem, false);
        }
    }

    function wireSignOut(handlerTarget) {
        const runLogout = async (e) => {
            e.preventDefault();
            try {
                await fetch('/api/logout', { method: 'POST', credentials: 'include' });
            } finally {
                window.location.href = '/index.html';
            }
        };
        if (handlerTarget && !handlerTarget.dataset.logoutWired) {
            handlerTarget.dataset.logoutWired = '1';
            handlerTarget.addEventListener('click', runLogout);
        }
        if (homeSignOutBtn && !homeSignOutBtn.dataset.logoutWired) {
            homeSignOutBtn.dataset.logoutWired = '1';
            homeSignOutBtn.addEventListener('click', runLogout);
        }
    }

    function applyLoggedIn(data) {
        const fullName = (data?.user?.name || '').trim();
        const firstName = (fullName.split(/\s+/)[0] || 'Account').slice(0, 20);
        const role = data?.user?.role || 'customer';
        const canSeeDashboard = ['employee', 'manager', 'primary', 'technical'].includes(role);
        const canSeeMyOrders = !canSeeDashboard;

        document.querySelectorAll('.user-orders-link').forEach((el) => {
            setAuthNavItemVisible(el, canSeeMyOrders);
        });
        document.querySelectorAll('.user-profile-link').forEach((el) => {
            setAuthNavItemVisible(el, canSeeMyOrders);
        });
        document.querySelectorAll('.user-support-link').forEach((el) => {
            setAuthNavItemVisible(el, canSeeMyOrders);
        });
        document.querySelectorAll('.staff-dashboard-link').forEach((el) => {
            setAuthNavItemVisible(el, canSeeDashboard);
        });
        document.querySelectorAll('.dashboard-nav-link').forEach((link) => {
            if (canSeeDashboard && link.closest('.home-account-list')) {
                link.innerHTML = '<i class="fas fa-chart-line" aria-hidden="true"></i> Dashboard';
            } else if (canSeeDashboard) {
                link.innerHTML = '<i class="fas fa-chart-line"></i> Dashboard';
            }
        });

        if (isHomeDropdown) {
            setHomeGuestMode(false);
            if (homeToggleLabel) homeToggleLabel.textContent = firstName;
            if (homePanelTitle) homePanelTitle.textContent = `Signed in as ${firstName}`;
            setAuthNavItemVisible(homeSignInItem, false);
            setAuthNavItemVisible(homeSignOutItem, true);
            wireSignOut(null);
        }

        if (authLink && !isHomeDropdown) {
            authLink.href = '#';
            authLink.innerHTML = `<i class="fas fa-user"></i> <span class="auth-name">${firstName}</span> <i class="fas fa-sign-out-alt auth-logout-icon" aria-hidden="true"></i>`;
            wireSignOut(authLink);
        }
    }

    try {
        const res = await fetch('/api/user', { credentials: 'include' });
        if (!res.ok) {
            applyLoggedOut();
            return;
        }
        const data = await res.json();
        applyLoggedIn(data);
        if (window.InfinityNotifications) InfinityNotifications.refreshBadges();
    } catch (_e) {
        applyLoggedOut();
    }
}

document.addEventListener('DOMContentLoaded', initAuthUI);

function initSiteAccountDropdown() {
    const root = document.getElementById('home-account-menu');
    const toggle = document.getElementById('home-account-toggle');
    const panel = document.getElementById('home-account-panel');
    const quickNav = document.querySelector('.home-quick-nav');
    if (!root || !toggle || !panel) return;

    function closePanel() {
        toggle.setAttribute('aria-expanded', 'false');
        panel.setAttribute('hidden', '');
    }

    function openPanel() {
        toggle.setAttribute('aria-expanded', 'true');
        panel.removeAttribute('hidden');
    }

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (root.classList.contains('is-guest')) {
            window.location.href = 'auth.html';
            return;
        }
        if (panel.hasAttribute('hidden')) openPanel();
        else closePanel();
    });

    panel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('click', () => {
        closePanel();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePanel();
    });

    panel.querySelectorAll('a.home-account-item').forEach((link) => {
        link.addEventListener('click', () => {
            closePanel();
        });
    });

    if (quickNav && 'IntersectionObserver' in window) {
        const hero = document.querySelector('.hero, .products-hero, .team-hero');
        if (quickNav.classList.contains('site-top-nav')) {
            const onScroll = () => {
                quickNav.classList.toggle('is-stuck', window.scrollY > 6);
            };
            onScroll();
            window.addEventListener('scroll', onScroll, { passive: true });

            const activeLink = quickNav.querySelector('.home-quick-links .home-quick-link.is-active');
            if (activeLink) {
                requestAnimationFrame(() => {
                    activeLink.scrollIntoView({ inline: 'nearest', block: 'nearest' });
                });
            }
        } else if (hero) {
            const obs = new IntersectionObserver((entries) => {
                quickNav.classList.toggle('is-stuck', !entries[0].isIntersecting);
            }, { threshold: 0, rootMargin: '-1px 0px 0px 0px' });
            obs.observe(hero);
        }
    }
}

document.addEventListener('DOMContentLoaded', initSiteAccountDropdown);

function initHomeQuickMobileNav() {
    document.querySelectorAll('nav.home-quick-nav').forEach((nav) => {
        const inner = nav.querySelector('.home-quick-nav-inner');
        if (!inner) return;

        if (inner.querySelector('.home-quick-nav-cart')) {
            nav.classList.add('has-mobile-cart');
        }

        let toggle = inner.querySelector('.site-nav-menu-toggle');
        if (!toggle) {
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'site-nav-menu-toggle menu-toggle';
            toggle.setAttribute('aria-label', 'Open navigation menu');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
            inner.appendChild(toggle);
        }

        function closeMobileNav() {
            inner.classList.remove('is-mobile-open');
            nav.classList.remove('is-mobile-menu-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
        }

        function openMobileNav() {
            inner.classList.add('is-mobile-open');
            nav.classList.add('is-mobile-menu-open');
            toggle.setAttribute('aria-expanded', 'true');
            toggle.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        }

        if (!toggle.dataset.bound) {
            toggle.dataset.bound = '1';
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (inner.classList.contains('is-mobile-open')) closeMobileNav();
                else openMobileNav();
            });
        }

        inner.querySelectorAll('.home-quick-links a.home-quick-link').forEach((link) => {
            if (link.dataset.mobileNavBound) return;
            link.dataset.mobileNavBound = '1';
            link.addEventListener('click', closeMobileNav);
        });

        if (!nav.dataset.mobileOutsideBound) {
            nav.dataset.mobileOutsideBound = '1';
            document.addEventListener('click', (e) => {
                if (!inner.classList.contains('is-mobile-open')) return;
                if (nav.contains(e.target)) return;
                closeMobileNav();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeMobileNav();
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', initHomeQuickMobileNav);
window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
        document.querySelectorAll('nav.home-quick-nav .home-quick-nav-inner.is-mobile-open').forEach((inner) => {
            inner.classList.remove('is-mobile-open');
            const nav = inner.closest('nav.home-quick-nav');
            if (nav) nav.classList.remove('is-mobile-menu-open');
            const toggle = inner.querySelector('.site-nav-menu-toggle');
            if (toggle) {
                toggle.setAttribute('aria-expanded', 'false');
                toggle.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
            }
        });
    }
});

/** Shared cart drawer rendering — single source of truth for all pages */
(function initInfinityCart(global) {
    if (global.InfinityCart) return;

    const DEFAULT_FALLBACK = 'assets/images/infinity-logo.png';

    function renderCartItems(container, cart, options) {
        if (!container) return;
        const opts = options || {};
        const productStockMap = opts.productStockMap || {};
        const fallbackImage = opts.fallbackImage || DEFAULT_FALLBACK;

        container.innerHTML = '';
        (cart || []).forEach((item) => {
            const stockNum = Number(productStockMap[item.id]);
            const maxAttr = Number.isFinite(stockNum) ? `max="${stockNum}"` : '';
            container.innerHTML += `
                <div class="cart-item">
                    <img class="cart-item-image" src="${item.image || fallbackImage}" alt="${item.name}">
                    <div class="item-info">
                        <h4>${item.name}</h4>
                        ${item.nameAr ? `<p class="arabic-title">${item.nameAr}</p>` : ''}
                        <p>EGP ${item.price.toFixed(2)} × ${item.quantity}</p>
                        ${item.installation > 0 ? `<p class="installation-fee">Installation: EGP ${item.installation.toFixed(2)}</p>` : ''}
                    </div>
                    <div class="item-actions">
                        <div class="cart-qty-stepper" role="group" aria-label="Quantity">
                            <button type="button" class="quantity-btn minus" data-id="${item.id}" aria-label="Decrease quantity">−</button>
                            <input type="number" class="cart-qty-input" data-id="${item.id}" min="1" ${maxAttr} value="${item.quantity}" inputmode="numeric" autocomplete="off" aria-label="Quantity">
                            <button type="button" class="quantity-btn plus" data-id="${item.id}" aria-label="Increase quantity">+</button>
                        </div>
                        <button type="button" class="remove-btn" data-id="${item.id}" aria-label="Remove from cart">×</button>
                    </div>
                </div>`;
        });
    }

    function updateCartTotals(cart, elements) {
        const items = cart || [];
        let subtotal = 0;
        let installation = 0;
        items.forEach((item) => {
            subtotal += item.price * item.quantity;
            installation += item.installation * item.quantity;
        });
        const count = items.reduce((sum, item) => sum + item.quantity, 0);

        if (elements.subtotalEl) {
            elements.subtotalEl.textContent = `EGP ${subtotal.toFixed(2)}`;
        }
        if (elements.installationEl) {
            elements.installationEl.textContent = `EGP ${installation.toFixed(2)}`;
        }
        if (elements.totalEl) {
            elements.totalEl.textContent = `EGP ${(subtotal + installation).toFixed(2)}`;
        }
        if (elements.countEl) {
            elements.countEl.textContent = count;
        } else if (elements.countSelector) {
            document.querySelectorAll(elements.countSelector).forEach((el) => {
                el.textContent = count;
            });
        }
    }

    global.InfinityCart = {
        DEFAULT_FALLBACK,
        renderCartItems,
        updateCartTotals,
    };
})(window);