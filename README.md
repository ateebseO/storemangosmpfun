# MangoSMP website (Netlify + Turso + Minecraft plugin)

Store, live leaderboards, player profiles, Discord login, owner page and currency converter.

| Folder / file | What it is |
|---|---|
| `site/` | The website pages (HTML, CSS, JavaScript) |
| `netlify/functions/api.mjs` and `lib/` | The secure backend API (runs on Netlify) |
| `db/schema.sql` | Database tables (created automatically on first use) |
| `minecraft-plugin/` | The plugin for your Minecraft server (stats sync and `/link`) |
| `.github/workflows/build-plugin.yml` | Builds the plugin jar for you on GitHub |
| `netlify.toml`, `package.json` | Netlify settings |
| `BEGINNER_GUIDE.md` | **Start here.** Step-by-step setup for beginners |
| `docs/API.md` | Every endpoint, every environment variable, and how security works |

How the pieces connect:
```
Players' browsers --> Netlify (site + /api) --> Turso database
                                ^
Minecraft server (Falix) -------+   (plugin sends stats with a secret key; players type /link CODE)
Discord  <--- login (OAuth) --- Netlify
```
No password or secret is ever stored in the website files. All secrets are Netlify environment variables (see `.env.example`).

Edit your server IP and Discord invite in `site/js/config.js`.
