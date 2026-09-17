import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const base = process.env.SMOKE_URL || "http://localhost:3000";
const email = "foundation-" + randomUUID() + "@example.com";
const password = randomUUID() + "Aa1!";
let userId;
async function main() {
  assert.equal((await fetch(base + "/api/health")).status, 200);
  const root = await fetch(base, { redirect: "manual", headers: { "accept-language": "en" } });
  assert.ok(root.headers.get("location")?.endsWith("/ru"));
  const chosen = await fetch(base, { redirect: "manual", headers: { cookie: "NEXT_LOCALE=kk" } });
  assert.ok(chosen.headers.get("location")?.endsWith("/kk"));
  for (const locale of ["ru", "kk", "en"]) {
    const page = await fetch(base + "/" + locale);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes('lang="' + locale + '"'));
  }
  const post = (path, data, cookie) => fetch(base + "/api/auth/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(data)
  });
  const created = await post("sign-up/email", { name: "Foundation test", email, password });
  assert.equal(created.status, 200, "Sign-up failed");
  const body = await created.json();
  userId = body.user.id;
  const cookies = created.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
  assert.ok(cookies);
  const session = await fetch(base + "/api/auth/get-session", { headers: { cookie: cookies } });
  assert.equal((await session.json()).user.id, userId);
  assert.ok((await post("sign-in/email", { email, password: "incorrect-password" })).status >= 400);
  const login = await post("sign-in/email", { email, password });
  assert.equal(login.status, 200);
  const signedOut = await post("sign-out", {}, cookies);
  assert.equal(signedOut.status, 200);
  assert.equal(await (await fetch(base + "/api/auth/get-session", { headers: { cookie: cookies } })).json(), null);
  console.log("smoke: OK (database, ru/kk/en, locale persistence, sign-up, session, sign-in rejection/success, sign-out)");
}
try { await main(); }
catch (error) { console.error("smoke: FAILED", error.message); process.exitCode = 1; }
finally {
  if (userId && process.env.DATABASE_URL) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    try { await sql`delete from "user" where id = ${userId} and email = ${email}`; }
    finally { await sql.end(); }
  }
}
