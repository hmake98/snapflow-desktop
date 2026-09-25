/**
 * Secure Environment Configuration
 *
 * Manages encrypted storage of sensitive secrets using electron.safeStorage
 * (OS Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 *
 * Flow:
 *   Prod, first launch: read plaintext bootstrap JSON (CI-generated,
 *     gitignored, never committed) → encrypt via safeStorage → store in
 *     electron-store → delete bootstrap file.
 *   Dev, first run: no bootstrap file exists. Run `npm run seed-secrets`
 *     once — it prompts on the terminal and encrypts straight into
 *     electron-store. No file is read or written either way.
 *   Every subsequent launch (dev or prod): decrypt from electron-store.
 *   Linux without a keyring: fall back to AES-256-GCM with a machine-derived
 *     key.
 *
 * There is no plaintext-file fallback anymore, in dev or prod — secrets only
 * ever exist on disk encrypted, inside electron-store.
 *
 * Bootstrap file is never bundled into .asar; it sits outside in extraResources
 * and is deleted after first successful encryption.
 */

import path from "path";
import fs from "fs";
import crypto from "crypto";
import readline from "readline";
import { safeStorage, app } from "electron";
import Store from "electron-store";
import log from "electron-log";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SecureConfigStore {
  [key: string]: string; // key → base64-encoded encrypted buffer
}

// ─── Constants ────────────────────────────────────────────────────────────────

// All keys that must be present in both bootstrap and store.
export const SECRET_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "ZOHO_CLIENT_ID",
  "ZOHO_CLIENT_SECRET",
  "NODE_ENV",
] as const;

// Keys an operator actually types in during `seedInteractive()` — NODE_ENV is
// derived from the running process, never prompted for.
const PROMPTED_SECRET_KEYS = SECRET_KEYS.filter((k) => k !== "NODE_ENV");

// Static salt — not secret, just entropy for Linux key derivation.
// Change this value to invalidate all previously derived keys on Linux.
const LINUX_FALLBACK_SALT = "snapflow-secure-config-v1";

// ─── electron-store ───────────────────────────────────────────────────────────

const secureStore = new Store<SecureConfigStore>({
  name: "snapflow-secure-config",
  defaults: {},
});

// ─── Linux AES-256-GCM fallback ───────────────────────────────────────────────

/**
 * Derives a 32-byte AES key from machine-specific data.
 * This is NOT as strong as OS Keychain but prevents trivial plaintext exposure.
 */
function deriveMachineKey(): Buffer {
  const userDataPath = app.getPath("userData");
  return crypto
    .createHash("sha256")
    .update(userDataPath)
    .update(LINUX_FALLBACK_SALT)
    .digest();
}

function aesEncrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

function aesDecrypt(b64: string, key: Buffer): string {
  const combined = Buffer.from(b64, "base64");
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// ─── Encryption facade ────────────────────────────────────────────────────────

function encryptValue(plaintext: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plaintext).toString("base64");
  }
  // Linux fallback
  log.warn(
    "[SecureConfig] safeStorage unavailable — using AES-256-GCM fallback (Linux headless)"
  );
  return "aes:" + aesEncrypt(plaintext, deriveMachineKey());
}

function decryptValue(stored: string): string {
  if (stored.startsWith("aes:")) {
    return aesDecrypt(stored.slice(4), deriveMachineKey());
  }
  return safeStorage.decryptString(Buffer.from(stored, "base64"));
}

// ─── Core logic ───────────────────────────────────────────────────────────────

function getBootstrapPath(): string {
  return path.join(process.resourcesPath, "app-bootstrap.json");
}

/**
 * Attempt to decrypt all secrets from the electron-store.
 * Returns a record of key → plaintext if ALL keys are present and decrypt successfully.
 * Returns null if any key is missing or decryption fails.
 */
function tryLoadFromStore(): Record<string, string> | null {
  try {
    const result: Record<string, string> = {};
    for (const key of SECRET_KEYS) {
      const stored = (secureStore as any).get(key);
      if (!stored) return null;
      result[key] = decryptValue(stored as string);
    }
    return result;
  } catch (err) {
    log.warn("[SecureConfig] Failed to decrypt from store:", err);
    return null;
  }
}

/**
 * Read and validate the bootstrap JSON file.
 * Returns the parsed object or throws if file is missing/invalid.
 */
function readBootstrapFile(): Record<string, string> {
  const bootstrapPath = getBootstrapPath();
  if (!fs.existsSync(bootstrapPath)) {
    throw new Error(`Bootstrap file not found at: ${bootstrapPath}`);
  }
  let raw: string;
  try {
    raw = fs.readFileSync(bootstrapPath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read bootstrap file: ${err}`, { cause: err });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Do NOT delete the file — preserve for debugging.
    throw new Error(
      `Bootstrap file at ${bootstrapPath} contains invalid JSON: ${err}`,
      { cause: err }
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Bootstrap file must be a JSON object");
  }
  return parsed as Record<string, string>;
}

/**
 * Encrypt all bootstrap secrets and persist to electron-store.
 */
function encryptAndStore(secrets: Record<string, string>): void {
  for (const key of SECRET_KEYS) {
    const value = secrets[key];
    if (value === undefined) {
      log.warn(`[SecureConfig] Bootstrap missing key: ${key}`);
      continue;
    }
    (secureStore as any).set(key, encryptValue(value));
  }
}

/**
 * Safely delete the bootstrap file.
 */
function deleteBootstrapFile(): void {
  const bootstrapPath = getBootstrapPath();
  try {
    if (fs.existsSync(bootstrapPath)) {
      fs.unlinkSync(bootstrapPath);
    }
  } catch (err) {
    log.warn("[SecureConfig] Could not delete bootstrap file:", err);
    // Non-fatal — the bootstrap file will just be ignored on next launch
    // because the store already has encrypted values.
  }
}

/**
 * Apply a secrets record to process.env.
 */
function applyToEnv(secrets: Record<string, string>): void {
  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

class SecureConfig {
  /**
   * Must be called after app.whenReady().
   *
   * Flow:
   *   1. Try to load all secrets from encrypted store (fast path on subsequent launches).
   *   2. If store load succeeds → delete bootstrap file if present → apply to process.env.
   *   3. If store load fails → read bootstrap file → encrypt → store → delete bootstrap → apply to process.env.
   */
  async initialize(): Promise<void> {
    // Fast path: all secrets are already encrypted in store.
    const fromStore = tryLoadFromStore();
    if (fromStore) {
      // Delete bootstrap if it somehow still exists (e.g., update shipped a new one).
      deleteBootstrapFile();
      applyToEnv(fromStore);
      return;
    }

    // Slow path: no valid store data — must bootstrap.

    let bootstrapSecrets: Record<string, string>;
    try {
      bootstrapSecrets = readBootstrapFile();
    } catch (err) {
      // No bootstrap file (normal in local dev) and nothing usable in the
      // encrypted store yet. There is no file-based fallback anymore —
      // secrets never live in a plaintext file, locally or otherwise.
      log.warn(
        "[SecureConfig] No bootstrap file and no secrets in encrypted store:",
        err
      );
      log.warn(
        '[SecureConfig] Run "npm run seed-secrets" once to store credentials in the OS keychain.'
      );
      log.warn(
        "[SecureConfig] Supabase and OAuth features will be unavailable until then."
      );
      return;
    }

    encryptAndStore(bootstrapSecrets);
    deleteBootstrapFile();
    applyToEnv(bootstrapSecrets);
  }

  /**
   * One-time interactive setup for local development.
   * Prompts for each secret on the terminal (masked input), encrypts them via
   * safeStorage (OS keychain), and writes them straight to electron-store —
   * no plaintext file is ever created. Run via `npm run seed-secrets`.
   */
  async seedInteractive(): Promise<void> {
    console.log("\nSnapFlow secure config — one-time local secret setup");
    console.log(
      "Values are encrypted via the OS keychain and never written to disk in plaintext.\n"
    );

    const secrets: Record<string, string> = {
      NODE_ENV: process.env.NODE_ENV || "development",
    };

    for (const key of PROMPTED_SECRET_KEYS) {
      secrets[key] = await promptMasked(`${key}: `);
    }

    encryptAndStore(secrets);
    console.log(
      "\nStored. You can delete any local .env file now — it is no longer read."
    );
  }
}

/**
 * Prompts on stdin with the typed characters masked as `*`.
 * Standard readline trick: the first _writeToOutput call is the prompt text
 * itself (left as-is), every call after that is a keystroke echo (masked).
 */
function promptMasked(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let promptWritten = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
      (stringToWrite: string) => {
        if (!promptWritten) {
          process.stdout.write(stringToWrite);
          promptWritten = true;
          return;
        }
        process.stdout.write("*".repeat(stringToWrite.length));
      };

    rl.question(query, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

export const secureConfig = new SecureConfig();
