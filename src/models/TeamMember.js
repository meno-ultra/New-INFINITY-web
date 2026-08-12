const mongoose = require("mongoose");

const TEAM_CATEGORIES = ["leadership", "technical", "employees", "operations", "sales"];
const TEAM_CATEGORY_LABELS = {
    leadership: "Leadership",
    technical: "Technical Team",
    employees: "Employees",
    operations: "Operations",
    sales: "Sales & Support",
};

const TeamMemberSchema = new mongoose.Schema({
    memberId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    positionTitle: { type: String, default: "", trim: true },
    bio: { type: String, default: "" },
    category: { type: String, enum: TEAM_CATEGORIES, default: "employees" },
    skills: { type: [String], default: [] },
    image: { type: String, default: "" },
    badge: { type: String, default: "", trim: true },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.models.TeamMember || mongoose.model("TeamMember", TeamMemberSchema);
module.exports.TEAM_CATEGORIES = TEAM_CATEGORIES;
module.exports.TEAM_CATEGORY_LABELS = TEAM_CATEGORY_LABELS;
