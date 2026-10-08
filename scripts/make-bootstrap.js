/* eslint-disable @typescript-eslint/no-require-imports */
// Local builds: create resources/app-bootstrap.json from .env so the packaged
// app can seed its keychain on first launch. CI writes this file itself, so an
// existing file is left alone.
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "..", "resources", "app-bootstrap.json");
const envPath = path.join(__dirname, "..", ".env");
const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];
// Zoho is optional — the app disables Zoho sync when these are absent.
const OPTIONAL_KEYS = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET"];

if (fs.existsSync(out)) process.exit(0);
if (!fs.existsSync(envPath)) {
  console.error(
    "make-bootstrap: no resources/app-bootstrap.json and no .env — packaged app would have no credentials."
  );
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
}
const missing = KEYS.filter((k) => !env[k]);
if (missing.length) {
  console.error(`make-bootstrap: .env missing ${missing.join(", ")}`);
  process.exit(1);
}
fs.writeFileSync(
  out,
  JSON.stringify(
    Object.fromEntries(
      KEYS.concat(OPTIONAL_KEYS)
        .filter((k) => env[k])
        .map((k) => [k, env[k]])
    )
  )
);
console.log("make-bootstrap: wrote resources/app-bootstrap.json");
