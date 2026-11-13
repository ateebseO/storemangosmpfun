// Netlify Function: serves every /api/* request.
import { onRequest } from "./lib/core.mjs";
import { openDb, ensureSchema } from "./lib/db.mjs";

export const config = { path: "/api/*" };

export default async (req) => {
  const env = { ...process.env };
  try {
    env.DB = openDb(env);
    if (env.DB) await ensureSchema(env.DB);
  } catch (err) {
    console.error("Database error:", err && err.message);
    env.DB = null; env.DB_ERROR = "unreachable";
  }
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  return onRequest({ request: req, env, params: { path } });
};
