# MangoSMP API reference

All endpoints live under `/api/` on your Netlify site and are served by one function (`netlify/functions/api.mjs`). Every one of them is covered by `test_endpoints` (80 checks), and the test fails if a route exists in the code without a test.

Responses are JSON (the CSV export and images excepted), are never cached by browsers, send `X-Content-Type-Options: nosniff`, and send **no CORS headers**, so other websites cannot read them.

## Environment variables (set in Netlify > Site configuration > Environment variables)
| Name | Required? | Rule | Used for |
|---|---|---|---|
| `TURSO_DATABASE_URL` | Yes | starts with `libsql://` | Database address |
| `TURSO_AUTH_TOKEN` | Yes | secret | Database access token |
| `ADMIN_PASSWORD` | Yes | **12+ characters** | Admin panel password |
| `SESSION_SECRET` | Yes | **32+ characters**, random | Signs login cookies |
| `STATS_API_KEY` | Yes (for Minecraft) | **24+ characters**, random, different from the others | Minecraft plugin key |
| `STATS_API_KEY_NEXT` | No | 24+ characters | Second key accepted during key rotation |
| `DISCORD_CLIENT_ID` | For Discord login | from the Discord Developer Portal | Discord OAuth2 |
| `DISCORD_CLIENT_SECRET` | For Discord login | secret | Discord OAuth2 |
| `SITE_URL` | For Discord login | `https://yoursite.netlify.app`, no trailing slash | Builds the Discord redirect address |
| `ADMIN_DISCORD_IDS` | No | Discord user IDs separated by commas | Lets those Discord accounts use the admin panel (no shared password) |

A secret that is too short is rejected, not accepted quietly. Open `/api/health` (or Admin > Setup check) to see which settings are missing.

## Public endpoints
| Method and path | Auth | What it does |
|---|---|---|
| `GET /api/health` | none | Setup status. Never shows secret values. Works even if the database is down |
| `GET /api/store` | none | Products and payment methods |
| `GET /api/image/:id` | none | An uploaded product image |
| `POST /api/orders` | CSRF header; Discord login optional | Create an order. The price is calculated on the server |
| `GET /api/orders/lookup?code=&mc=` | order code plus Minecraft name (or the owner's Discord login) | Read one order |
| `POST /api/orders/reference` | CSRF header; same proof as lookup | Customer adds a payment reference. Status becomes `submitted`, never `paid` |
| `GET /api/leaderboard?cat=&page=&q=` | none | `cat`: kills, deaths, playtime, balance, shards, killstreak, online. 20 per page. Reports "unavailable" if no data |
| `GET /api/player?name=` | none | One player profile with leaderboard positions |

## Discord login and account
| Method and path | Auth | What it does |
|---|---|---|
| `GET /api/auth/discord/login[?next=admin]` | none | Redirects to Discord (OAuth2, scope `identify` only) |
| `GET /api/auth/discord/callback` | state cookie | Verifies state, exchanges the code, creates the session cookie |
| `POST /api/auth/logout` | CSRF header | Clears the session cookie |
| `GET /api/me` | session cookie | Discord profile and linked Minecraft account |
| `GET /api/me/orders` | session cookie | The user's orders |
| `POST /api/me/link-code` | session cookie + CSRF header | Makes a 6-character code valid for 10 minutes |
| `POST /api/me/unlink` | session cookie + CSRF header | Unlinks the Minecraft account |

## Minecraft plugin (secret key)
Send `Authorization: Bearer <STATS_API_KEY>` over HTTPS.

`POST /api/ingest`, up to 100 players per request, every stat optional (a missing stat keeps its old value):
```json
{ "online_count": 2, "online": ["<uuid>", "<uuid>"],
  "players": [ { "uuid": "...", "name": "Steve", "rank": "VIP", "kills": 10, "deaths": 4,
                 "playtime": 7200, "balance": 1500.5, "shards": 30, "killstreak": 3 } ] }
```
`POST /api/link/confirm` with `{ "code": "ABC234", "uuid": "...", "name": "Notch" }`. Called when a player types `/link ABC234`. It proves the player owns that Minecraft account. Returns 404 for a wrong or expired code and 409 if that Minecraft account is already linked to someone else.

## Admin endpoints
Require the admin cookie (password login) **or** a Discord login whose ID is in `ADMIN_DISCORD_IDS`. Every write also needs the `X-Requested-With: mangosmp` header. Without login they all return 401.

| Method and path | What it does |
|---|---|
| `GET /api/admin/options` (public) | Which login methods are available |
| `POST /api/admin/login` | Password login (rate limited: 8 wrong tries per 15 minutes per visitor) |
| `GET /api/admin/me`, `POST /api/admin/logout` | Who is logged in, log out |
| `GET /api/admin/products`, `POST`, `PUT /:id`, `DELETE /:id` | Manage products |
| `POST /api/admin/image` | Upload a PNG/JPG/WEBP/GIF under 400 KB (SVG refused) |
| `GET /api/admin/orders?status=&q=`, `PUT /:id` | View orders, set status and note |
| `GET /api/admin/payments`, `POST`, `PUT /:id`, `DELETE /:id` | Manage payment methods |
| `GET /api/admin/audit` | The last 100 admin actions (who, what, when) |
| `GET /api/admin/export/orders` | All orders as a CSV file (protected against spreadsheet formula injection) |

## How the security requirements are met
**Secure admin authentication**
- Passwords of 12+ characters only; a weaker `ADMIN_PASSWORD` is refused with a message.
- Constant-time comparison, rate limiting, and a signed, `HttpOnly`, `Secure`, `SameSite=Strict` cookie that lasts 8 hours.
- Anti-forgery header on every write; every action is logged.
- Optional per-person access through Discord, so you do not have to share one password.
- To log everyone out immediately, change `SESSION_SECRET` and redeploy.

**Minecraft plugin authentication**
- A separate secret key (24+ characters), different from the admin password. The admin password does not work as a plugin key and vice versa.
- Constant-time check, rate limiting (20 wrong tries per 15 minutes), and key rotation through `STATS_API_KEY_NEXT`.
- To rotate without downtime: set `STATS_API_KEY_NEXT` to the new key, redeploy, update the plugin's `config.yml`, then move the new key into `STATS_API_KEY` and clear `STATS_API_KEY_NEXT`.

**Secure database storage**
- The connection to Turso uses HTTPS with a token kept only in Netlify variables. Every query is parameterized (tested against SQL injection).
- No passwords, tokens or secrets are stored in the database. Discord access tokens are not stored at all (only the Discord ID, name and avatar).
- Visitor addresses used for rate limiting are deleted after 24 hours.
- Product images are limited to 400 KB each. Orders can be exported as CSV for your own backups. Check Turso's current documentation for its backup and at-rest encryption policies on your plan.
