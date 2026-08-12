const mongoose = require("mongoose");

/**
 * Auth middleware factory — keeps env-based role resolution in one place.
 * @param {{ primaryAdminEmail: string, managerEmails: string[], employeeEmails: string[] }} config
 */
function createAuthMiddleware(config) {
    const primaryAdminEmail = String(config.primaryAdminEmail || "").trim().toLowerCase();
    const managerEmails = Array.isArray(config.managerEmails) ? config.managerEmails : [];
    const employeeEmails = Array.isArray(config.employeeEmails) ? config.employeeEmails : [];

    function requireAuth(req, res, next) {
        if (!req.session?.user) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        next();
    }

    function requireRole(allowedRoles = []) {
        return (req, res, next) => {
            if (!req.session?.user) return res.status(401).json({ error: "Not authenticated" });
            if (!allowedRoles.includes(req.session.user.role)) {
                return res.status(403).json({ error: "Not authorized" });
            }
            next();
        };
    }

    function getSessionUserObjectId(req) {
        return new mongoose.Types.ObjectId(req.session.user.id);
    }

    function getRoleForEmail(email = "") {
        const e = String(email).toLowerCase().trim();
        if (primaryAdminEmail && e === primaryAdminEmail) return "primary";
        if (managerEmails.includes(e)) return "manager";
        if (employeeEmails.includes(e)) return "employee";
        return null;
    }

    return {
        requireAuth,
        requireRole,
        getSessionUserObjectId,
        getRoleForEmail,
    };
}

module.exports = createAuthMiddleware;
