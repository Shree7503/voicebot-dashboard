#!/usr/bin/env node
/**
 * Dashboard admin commands (reads MONGODB_URI and CITIZEN_DB from .env / .env.local):
 *
 *   npm run admin -- set-password                                  sets the control room password
 *   npm run admin -- ping                                          check the connection (read-only)
 *
 * set-password asks for the password twice and writes only its hash (DASHBOARD_PASSWORD_HASH)
 * into .env; changing it signs out every open session.
 */

import { randomBytes, scrypt } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import mongoose from "mongoose";

const MIN_PASSWORD_LENGTH = 12;
const ENV_FILE = process.env.DASHBOARD_ENV_FILE || new URL("../.env", import.meta.url);

// same format as src/lib/server/auth/password.ts
function hashPassword(password) {
  const [N, r, p] = [16384, 8, 1];
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(`scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${key.toString("base64url")}`),
    ),
  );
}

// same rule as passwordProblem in src/lib/server/auth/password.ts
function passwordProblem(password) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if ([...password].length >= 16) return null; // long passphrases, in any script
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (kinds < 3) return "Mix at least three of: lowercase letters, capitals, digits and symbols.";
  return null;
}

let prompt; // one interface for every question in a terminal
let pipedLines; // answers read up front when input is piped (scripts, CI)

/** Asks a question without echoing the answer. */
async function askHidden(question) {
  process.stdout.write(question);
  if (!process.stdin.isTTY) {
    if (!pipedLines) {
      let text = "";
      for await (const chunk of process.stdin) text += chunk;
      pipedLines = text.split(/\r?\n/);
    }
    process.stdout.write("\n");
    const answer = pipedLines.shift();
    if (!answer) throw new Error("No answer given. Nothing changed.");
    return answer;
  }
  prompt ??= createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  prompt._writeToOutput = () => {}; // never echo what is typed
  return new Promise((resolve) =>
    prompt.question("", (answer) => {
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

function closePrompt() {
  prompt?.close();
}

/** Replaces (or adds) NAME=value in .env, keeping every other line as it is. */
function setEnvValue(name, value) {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const next = pattern.test(text) ? text.replace(pattern, line) : `${text}${text.endsWith("\n") || !text ? "" : "\n"}${line}\n`;
  writeFileSync(ENV_FILE, next, { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600); // also when the file already existed
}

async function setPassword() {
  const password = await askHidden("New control room password: ");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if ((await askHidden("Type it again: ")) !== password) throw new Error("The two passwords don't match. Nothing changed.");
  setEnvValue("DASHBOARD_PASSWORD_HASH", await hashPassword(password));
  if (!/^DASHBOARD_JWT_SECRET=.{32,}$/m.test(existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "")) {
    setEnvValue("DASHBOARD_JWT_SECRET", randomBytes(48).toString("base64url"));
  }
  console.log("Password set in .env. Restart the dashboard; open sessions are signed out.");
}

/** Read-only: checks the connection and that the bot's collections are where we expect. */
async function ping(db) {
  await db.command({ ping: 1 });
  console.log(`connected: database "${db.databaseName}"`);
  for (const name of ["interactions", "cases", "citizens", "dash_audit_log"]) {
    console.log(`  ${name}: ${await db.collection(name).estimatedDocumentCount()} documents`);
  }
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command === "set-password") return setPassword().finally(closePrompt);
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (put it in .env)");
  const dbName = process.env.CITIZEN_DB || "voicebot";
  await mongoose.connect(process.env.MONGODB_URI, { dbName, serverSelectionTimeoutMS: 8000, autoIndex: false });
  try {
    const db = mongoose.connection.getClient().db(dbName);
    if (command === "ping") await ping(db);
    else throw new Error("commands: set-password | ping");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
