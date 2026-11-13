# MangoSMP: complete beginner setup guide

Follow the parts **in order**. Every part tells you exactly what to click. Take your time; the whole thing is about 60 to 90 minutes the first time.

**Everything here uses free plans.** Free plans can change, so check each service's pricing page.

## What you are setting up
| Service | What it does for you | Cost |
|---|---|---|
| **GitHub** | Stores your website files | Free |
| **Netlify** | Hosts the website and its secure backend | Free plan |
| **Turso** | The database (products, orders, player stats, Discord users) | Free plan |
| **Discord Developer Portal** | Lets players "Login with Discord" | Free |
| **Falix** (you already have it) | Your Minecraft server, running the small MangoStatsSync plugin | Your current plan |

**Keep a notes file open.** You will copy several values (URLs, tokens, passwords). Never post them in public (Discord, GitHub, screenshots).

---

## PART 0: Extract the zip (2 minutes)
**Always extract the zip before doing anything else** (right-click the zip, then **Extract All**). Never double-click files while they are still inside the zip. The pages need the `css`, `js` and `assets` folders next to them, otherwise the site looks like plain text.
To just look at the design on your computer, open the extracted folder, then `site`, then double-click `index.html`. The store, leaderboards and login only work after you deploy (Parts 1 to 4).

## PART 1: Put the project on GitHub (10 minutes)
1. Go to **github.com** and sign up (or log in).
2. Click the **+** at the top right, then **New repository**.
3. Repository name: `mangosmp-website`. Choose **Private**. Click **Create repository**.
4. On the new empty repo page, click **uploading an existing file**.
5. On your computer, **unzip** the project zip. Open the unzipped folder. Select **everything inside it** (folders and files, including the hidden `.github` folder if you can see it) and **drag it into the GitHub page**. Do not upload the zip itself.
   - If the `.github` folder is hidden: in Windows File Explorer click **View > Show > Hidden items**. If you still cannot upload it, skip it and follow the note in Part 6.1.
6. Wait for the upload to finish. At the bottom click **Commit changes**.
7. Check your repo shows these items: `site`, `netlify`, `minecraft-plugin`, `db`, `netlify.toml`, `package.json`.

## PART 2: Create the database on Turso (5 minutes)
1. Go to **turso.tech** and click **Sign up**. Choose **Continue with GitHub**.
2. Create a database: click **Create Database**. Name it `mangosmp`. Pick the location closest to you (for Pakistan, a Mumbai or Singapore region is a good choice if offered). Create it.
3. Open the database. Find the **Database URL** (it starts with `libsql://`). Copy it into your notes as **TURSO_DATABASE_URL**.
4. Create an access token: on the database page look for **Generate Token** (or **Create Token**). Choose **Read & Write** and no expiry. Copy it into your notes as **TURSO_AUTH_TOKEN**. (It is shown only once.)

You do **not** need to create any tables. The website creates them by itself the first time it runs.

## PART 3: Put the website on Netlify (10 minutes)
1. Go to **netlify.com** and sign up with **GitHub**.
2. Click **Add new site > Import an existing project > Deploy with GitHub**. Allow access and choose your `mangosmp-website` repo.
3. The settings fill in automatically from `netlify.toml` (publish folder `site`, functions `netlify/functions`). Leave the build command empty. Click **Deploy**.
4. When the deploy finishes, Netlify shows a web address like `https://random-name-123.netlify.app`. Open **Site configuration > Change site name** and choose a nice name such as `mangosmp`. Your site is now `https://mangosmp.netlify.app`. Copy it into your notes as **SITE_URL** (no slash at the end).

### Make your secret passwords
You need three random values. Use a password generator (for example the one on bitwarden.com/password-generator): length **48**, letters and numbers only.
- **SESSION_SECRET**: generate one value.
- **STATS_API_KEY**: generate a different value.
- **ADMIN_PASSWORD**: a long password you will remember for the admin panel (16+ characters).

### Add the environment variables
1. In Netlify open **Site configuration > Environment variables > Add a variable**.
2. Add each of these one at a time (name exactly as written). When asked, keep **all scopes** selected, and turn on **Contains secret values** for the secret ones:

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | from Part 2 |
| `TURSO_AUTH_TOKEN` | from Part 2 |
| `ADMIN_PASSWORD` | your admin password (**at least 12 characters**; shorter ones are refused) |
| `SESSION_SECRET` | the random value (at least 32 characters) |
| `STATS_API_KEY` | the other random value (at least 24 characters) |
| `SITE_URL` | `https://mangosmp.netlify.app` (your real address) |

(You will add the Discord values in Part 4. Optional variables are listed in `docs/API.md`.)

3. Go to **Deploys > Trigger deploy > Clear cache and deploy site**. Wait for **Published**.
4. **Check your setup:** open `https://YOURSITE.netlify.app/api/health`. It lists every setting as `ok`, `missing` or `too_short` (it never shows your secret values). Fix anything that is not `ok`, redeploy, and check again. Later you can see the same table in the admin panel under **Setup check**.
5. Test it: open `https://YOURSITE.netlify.app/store.html`. You should see the store with 10 products showing "Price not set". If it says "Data temporarily unavailable", check the two Turso values.

## PART 4: Discord login (10 minutes)
1. Go to **discord.com/developers/applications** and log in. Click **New Application**. Name it `MangoSMP`. Create.
2. Click **OAuth2** in the left menu.
3. Copy the **Client ID** into your notes as **DISCORD_CLIENT_ID**.
4. Click **Reset Secret**, confirm, then copy the **Client Secret** as **DISCORD_CLIENT_SECRET**. (Shown once. Keep it private.)
5. Under **Redirects** click **Add Redirect** and paste exactly:
   `https://YOURSITE.netlify.app/api/auth/discord/callback`
   (replace YOURSITE with your real name). Click **Save Changes**.
6. Back in Netlify add two more environment variables: `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.
7. **Trigger deploy** again (Part 3, step 3).
8. Test: open `/account.html`, click **Login with Discord**, press **Authorize**. You should come back logged in with your Discord name and avatar.

## PART 5: Set up your store (10 minutes)
1. Open `https://YOURSITE.netlify.app/admin.html` and log in with your `ADMIN_PASSWORD`.
2. **Products** tab: click **Edit** on each rank and key, set the price in PKR, write the real benefits, and turn on **Enabled**.
3. **Payment methods** tab: replace the example with your real payment instructions (for example your account details). These are public on checkout, so never write secrets here.
4. **Orders** tab: when a customer pays, check the money arrived, then change the order status to **Payment verified** and later **Delivered**. **Download CSV** saves all orders as a backup.
5. **Activity** tab: a log of who changed what. **Setup check** tab: shows what is configured and what still needs fixing.
6. **Optional, so staff do not share one password:** add the Netlify variable `ADMIN_DISCORD_IDS` with the Discord user IDs of your admins, separated by commas (in Discord turn on Developer Mode, right-click a person, **Copy User ID**). They will then see a **Login with Discord** button on the admin page.

Edit your Discord invite and server IP in `site/js/config.js` (on GitHub click the file, then the pencil icon, change it, **Commit changes**; Netlify redeploys by itself).

## PART 6: Connect your Minecraft server on Falix (20 minutes)
### 6.1 Get the plugin file (GitHub builds it for you)
1. In your GitHub repo click the **Actions** tab. If asked, click **I understand my workflows, go ahead and enable them**.
2. Click **Build Minecraft plugin** on the left, then **Run workflow > Run workflow**.
3. Wait 1 to 2 minutes until you see a green check. Click the run, scroll to **Artifacts**, and download **MangoStatsSync**.
4. Unzip it. Inside is **MangoStatsSync.jar**. That is your plugin.
   - If you do not see an Actions tab or a "Build Minecraft plugin" workflow, the hidden `.github` folder was not uploaded. In your repo click **Add file > Create new file**, type the name `.github/workflows/build-plugin.yml`, paste the text from `.github/workflows/build-plugin.yml` in the project zip, and commit.
   - If the build shows a red X, open it and send me the error text.

### 6.2 Check your server software
In the Falix panel open your server and check the **server software is Paper** (or Spigot). Plugins do not work on Vanilla or Fabric. Menu names on Falix can change; look for "Software", "Version" or "Settings".

### 6.3 Upload the plugins
1. **Stop** the server.
2. Open **Files** (File Manager) and open the **plugins** folder.
3. Upload **MangoStatsSync.jar**.
4. Look at what is already in `plugins`. For balance, rank, shards and killstreaks you need:
   - **PlaceholderAPI** (upload it if missing; download from hangar.papermc.io or the Falix plugin installer)
   - **Vault** and an **economy plugin** (for example EssentialsX) if you want balances
   You may already have these.
5. **Start** the server so the plugin creates its settings file, then **stop** it again.

### 6.4 Connect the plugin to your website
1. In **Files** open `plugins/MangoStatsSync/config.yml` and edit:
   - `api-url:` `"https://YOURSITE.netlify.app/api/ingest"`
   - `api-key:` `"PASTE YOUR STATS_API_KEY HERE"` (exactly the same value you put in Netlify)
2. Save the file and **start** the server.
3. In the server console type:
   `papi ecloud download Vault` then `papi reload`
4. Test the connection. In the console type: `mangostats sync`, wait 5 seconds, then `mangostats status`. It must say **HTTP 200**.
5. Open your website **Leaderboards** page. Online players appear within a minute. Offline players fill in gradually (25 per minute), so a big server can take a while the first time.

### 6.5 Shards and killstreaks
Shards and killstreaks come from the plugins you use for them, so you must tell MangoStatsSync which **PlaceholderAPI placeholder** to read.
1. Find the placeholder in that plugin's documentation (search "PlaceholderAPI placeholders").
2. Test it in game: `/papi parse me %the_placeholder%`. It must show a plain number.
3. Put it in `config.yml` under `placeholders:` (`shards:` or `killstreak:`), save, and restart.
Until then those two leaderboards will say "No players on this leaderboard yet". If you tell me the names of your shards and killstreak plugins I can tell you the placeholder.

### 6.6 Link a Minecraft account to Discord (do this once to test)
1. On your website open **Player Login**, log in with Discord and click **Get my link code**.
2. In Minecraft join `mangosmp.falix.gg` and type `/link YOURCODE` in chat.
3. The website page updates by itself to show your verified Minecraft account.

## PART 7: Final test checklist
- [ ] Home page loads and the **Owner** page shows VEXOR PRIME with working YouTube and Instagram buttons
- [ ] **Store**: add a ranked product, checkout, place an order, see the order page
- [ ] **Admin**: log in, see the order, change its status
- [ ] **Leaderboards**: all 7 tabs open, search works, clicking a player opens their profile
- [ ] **Player Login**: Discord login works, Minecraft linking works, orders list shows your order
- [ ] On your phone everything fits the screen

## Replacing a secret later
- **Admin password:** change `ADMIN_PASSWORD` in Netlify and redeploy.
- **Log everyone out of the admin panel:** change `SESSION_SECRET` and redeploy.
- **Plugin key (no downtime):** set `STATS_API_KEY_NEXT` to a new value and redeploy, change `api-key` in the plugin's `config.yml`, restart the server, then put the new value into `STATS_API_KEY` and delete `STATS_API_KEY_NEXT`.

## Troubleshooting
| What you see | Fix |
|---|---|
| The website looks like plain text: no colors, a broken logo, a big blue shape | The browser cannot find the `css` and `assets` folders. (1) If you opened it on your computer: extract the zip first and open `site/index.html` from the extracted folder. (2) If it is on Netlify: open `https://YOURSITE.netlify.app/css/style.css`. If you see "Page not found", the `site` folder was not uploaded in full to GitHub (upload again, including the `css`, `js` and `assets` folders inside `site`) or Netlify's **Publish directory** is not `site` (Site configuration > Build & deploy > Publish directory). Then redeploy |
| Site says "Data temporarily unavailable" on store or leaderboards | Netlify variables `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` wrong, or you did not redeploy after adding them |
| `/mangostats status` shows 401 | `api-key` in config.yml is different from `STATS_API_KEY` in Netlify |
| `/mangostats status` shows 503 | `STATS_API_KEY` missing in Netlify, or shorter than 24 characters, or you did not redeploy |
| "Could not reach the website" | Check `api-url` spelling (must end with `/api/ingest`). If still failing, Falix may block outgoing connections; ask Falix support |
| Leaderboards empty but status is HTTP 200 | Wait a minute, and check Balance/Rank/Shards placeholders with `/papi parse me ...` |
| Discord login says "not set up" | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SITE_URL` missing, or not redeployed |
| Discord shows "Invalid OAuth2 redirect_uri" | The Redirect in the Discord portal must exactly match `https://YOURSITE.netlify.app/api/auth/discord/callback` |
| `/link` says code expired | Codes last 10 minutes. Get a new one on the Account page |
| Admin says the password is too short | `ADMIN_PASSWORD` must be 12+ characters. Change it in Netlify and redeploy |
| Admin password not accepted | Check `/api/health`, or change `ADMIN_PASSWORD` in Netlify and redeploy |

## Security rules
- Never share `ADMIN_PASSWORD`, `STATS_API_KEY`, `TURSO_AUTH_TOKEN` or `DISCORD_CLIENT_SECRET`.
- If a secret leaks, change it in Netlify (and in the plugin's `config.yml` for the stats key), then redeploy.
- Never put secrets in GitHub files or in payment instructions.
- Use a long admin password; short passwords like a name plus numbers are easy to guess.

## Honest notes
- The "Login with Discord" button proves who someone is on **Discord**. A Minecraft account is only **verified** after the player types `/link` in game.
- The older quick player sign-in on the home page (Java/Bedrock/Guest) is not verified. It is only for convenience.
- No payment is taken on the website. You verify payments yourself in the admin panel.
- Leaderboards are as fresh as the sync interval (60 seconds by default).
