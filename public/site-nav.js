/**
 * Shared site top navigation — inject into [data-site-nav-mount] on legal/utility pages.
 * Source of truth: snippets/site-top-nav.html (keep in sync).
 */
(function () {
    const SITE_NAV_HTML = `<nav class="home-quick-nav site-top-nav" aria-label="Site navigation">
    <div class="container home-quick-nav-inner">
        <a href="index.html" class="logo home-quick-logo">
            <img src="assets/images/infinity-logo.png" alt="" class="logo-image" width="48" height="48">
            <svg viewBox="0 0 600 180" xmlns="http://www.w3.org/2000/svg" class="nav-logo-svg" aria-hidden="true">
                <defs>
                    <linearGradient id="infinityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#0f3d52;stop-opacity:1" />
                        <stop offset="40%" style="stop-color:#3a8db0;stop-opacity:1" />
                        <stop offset="50%" style="stop-color:#5cb3d4;stop-opacity:1" />
                        <stop offset="60%" style="stop-color:#3a8db0;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#0f3d52;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <text x="10" y="100" font-family="Montserrat, Arial, sans-serif" font-weight="800" font-size="130" letter-spacing="6" fill="url(#infinityGrad)">INFINITY</text>
                <text x="300" y="145" font-family="Montserrat, Arial, sans-serif" font-weight="500" font-size="25" letter-spacing="1" fill="#3a7a95">Total-Com Solutions</text>
            </svg>
            <span class="visually-hidden">INFINITY Total-Com Solutions — Home</span>
        </a>
        <div class="home-quick-links">
            <a href="index.html" class="home-quick-link"><i class="fas fa-home" aria-hidden="true"></i> Home</a>
            <a href="index.html#about" class="home-quick-link"><i class="fas fa-building" aria-hidden="true"></i> About</a>
            <a href="index.html#mission" class="home-quick-link home-quick-link--trim"><i class="fas fa-bullseye" aria-hidden="true"></i> Mission</a>
            <a href="index.html#services" class="home-quick-link"><i class="fas fa-wrench" aria-hidden="true"></i> Services</a>
            <a href="products.html" class="home-quick-link"><i class="fas fa-shopping-bag" aria-hidden="true"></i> Products</a>
            <a href="index.html#clients" class="home-quick-link home-quick-link--trim"><i class="fas fa-handshake" aria-hidden="true"></i> Clients</a>
            <a href="team.html" class="home-quick-link" title="Our Team"><i class="fas fa-users" aria-hidden="true"></i> Team</a>
            <a href="index.html#contact" class="home-quick-link"><i class="fas fa-map-marker-alt" aria-hidden="true"></i> Contact</a>
        </div>
        <div class="home-quick-nav-actions">
            <div class="home-account-dropdown is-guest" id="home-account-menu">
                <button type="button" class="home-account-toggle" id="home-account-toggle" data-notif-badge aria-expanded="false" aria-controls="home-account-panel" aria-haspopup="true">
                    <i class="fas fa-user home-account-toggle-icon" aria-hidden="true"></i>
                    <span class="home-account-toggle-label">Sign In</span>
                    <i class="fas fa-chevron-down home-account-chevron" aria-hidden="true"></i>
                </button>
                <div class="home-account-panel" id="home-account-panel" hidden>
                    <p class="home-account-panel-title">Your account</p>
                    <ul class="home-account-list">
                        <li class="user-orders-link" hidden>
                            <a href="user-dashboard.html" class="home-account-item my-orders-nav-link">
                                <i class="fas fa-receipt" aria-hidden="true"></i> My Orders
                            </a>
                        </li>
                        <li class="user-profile-link" hidden>
                            <a href="profile.html" class="home-account-item">
                                <i class="fas fa-user-circle" aria-hidden="true"></i> Profile
                            </a>
                        </li>
                        <li class="user-support-link" hidden>
                            <a href="support.html" class="home-account-item">
                                <i class="fas fa-life-ring" aria-hidden="true"></i> Support
                            </a>
                        </li>
                        <li class="staff-dashboard-link" hidden>
                            <a href="dashboard.html" class="home-account-item dashboard-nav-link">
                                <i class="fas fa-chart-line" aria-hidden="true"></i> Dashboard
                            </a>
                        </li>
                        <li class="home-account-signin-item" hidden>
                            <a href="auth.html" class="home-account-item account-link">
                                <i class="fas fa-sign-in-alt" aria-hidden="true"></i> Sign In
                            </a>
                        </li>
                        <li class="home-account-signout-item" hidden>
                            <button type="button" class="home-account-item home-account-signout-btn" id="home-account-signout">
                                <i class="fas fa-sign-out-alt" aria-hidden="true"></i> Sign Out
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</nav>`;

    function mountSiteNav() {
        document.querySelectorAll('[data-site-nav-mount]').forEach((el) => {
            el.outerHTML = SITE_NAV_HTML;
        });
    }

    mountSiteNav();
})();
