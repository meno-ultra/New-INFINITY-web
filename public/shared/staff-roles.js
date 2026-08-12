(function (global) {
    if (global.StaffRoles) return;

    const ALL = Object.freeze(["employee", "manager", "primary", "technical"]);
    const SUPPORT = Object.freeze(["employee", "manager", "primary"]);

    global.StaffRoles = {
        ALL,
        SUPPORT,
        isStaff(role) {
            return ALL.includes(role);
        },
        canStaffSupport(role) {
            return SUPPORT.includes(role);
        },
    };
})(window);
