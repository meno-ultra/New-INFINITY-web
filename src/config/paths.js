const path = require("path");

/** Absolute path to the browser-facing static root. */
const PUBLIC_ROOT = path.join(__dirname, "..", "..", "public");

function publicPath(...segments) {
    return path.join(PUBLIC_ROOT, ...segments);
}

module.exports = {
    PUBLIC_ROOT,
    publicPath,
};
