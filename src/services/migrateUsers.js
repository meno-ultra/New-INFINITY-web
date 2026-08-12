async function migrateExistingUsers(User) {
    const legacy = await User.updateMany(
        { $or: [{ accountType: { $exists: false } }, { accountType: null }, { accountType: "" }] },
        { $set: { accountType: "personal" } }
    );
    const verified = await User.updateMany(
        { $or: [{ emailVerified: { $exists: false } }, { emailVerified: null }] },
        { $set: { emailVerified: true } }
    );
    const identity = await User.updateMany(
        { "identityVerification.status": { $exists: false } },
        { $set: { "identityVerification.status": "none", "identityVerification.documents": [] } }
    );

    const legacyDocs = await User.find({
        "identityVerification.documents": { $exists: true, $ne: [] },
        "identityVerification.documents.status": { $exists: false },
    }).select("identityVerification").limit(500);

    let docMigrated = 0;
    for (const user of legacyDocs) {
        const overall = user.identityVerification?.status || "none";
        let changed = false;
        (user.identityVerification?.documents || []).forEach((doc) => {
            if (!doc.status) {
                doc.status = overall === "approved" ? "approved"
                    : overall === "pending" ? "pending"
                    : "draft";
                changed = true;
            }
        });
        if (changed) {
            await user.save();
            docMigrated += 1;
        }
    }

    if (legacy.modifiedCount || verified.modifiedCount || identity.modifiedCount || docMigrated) {
        console.log(
            `[migration] users updated — accountType: ${legacy.modifiedCount}, `
            + `emailVerified: ${verified.modifiedCount}, identity: ${identity.modifiedCount}, `
            + `docStatus: ${docMigrated}`
        );
    }
}

module.exports = { migrateExistingUsers };
