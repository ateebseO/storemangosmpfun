package com.mangosmp.stats;

import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.Statistic;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.lang.reflect.Method;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * MangoStatsSync: sends real player statistics from this Minecraft server to the MangoSMP website API.
 * The API key lives only in this server's config.yml. Nothing is sent except the stats listed below.
 */
public final class MangoStatsSync extends JavaPlugin {
    private static final Pattern STAT_FILE = Pattern.compile("^[0-9a-fA-F-]{36}\\.json$");
    private static final Pattern PLAIN_NUMBER = Pattern.compile("^\\d+(\\.\\d+)?$");

    private HttpClient http;
    private String url = "", key = "", phBalance = "", phShards = "", phKillstreak = "", phRank = "", statsFolder = "";
    private int interval = 60, sweep = 25, lastCode = 0;
    private Method papi;
    private Statistic playStat;
    private final List<File> files = new ArrayList<>();
    private int cursor = 0;
    private final Map<UUID, Long> linkCooldown = new HashMap<>();
    private volatile String lastStatus = "No sync has run yet.";

    @Override
    public void onEnable() {
        saveDefaultConfig();
        url = getConfig().getString("api-url", "").trim();
        key = getConfig().getString("api-key", "").trim();
        interval = Math.max(20, getConfig().getInt("interval-seconds", 60));
        sweep = Math.max(0, getConfig().getInt("offline-players-per-sync", 25));
        statsFolder = getConfig().getString("stats-folder", "").trim();
        phBalance = getConfig().getString("placeholders.balance", "").trim();
        phShards = getConfig().getString("placeholders.shards", "").trim();
        phKillstreak = getConfig().getString("placeholders.killstreak", "").trim();
        phRank = getConfig().getString("placeholders.rank", "").trim();
        http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        playStat = findStat("PLAY_ONE_MINUTE", "PLAY_TIME");

        if (Bukkit.getPluginManager().isPluginEnabled("PlaceholderAPI")) {
            try {
                papi = Class.forName("me.clip.placeholderapi.PlaceholderAPI").getMethod("setPlaceholders", OfflinePlayer.class, String.class);
            } catch (Exception e) {
                getLogger().warning("PlaceholderAPI was found but could not be used: " + e.getMessage());
            }
        } else if (!phBalance.isEmpty() || !phShards.isEmpty() || !phKillstreak.isEmpty() || !phRank.isEmpty()) {
            getLogger().warning("Placeholders are configured but PlaceholderAPI is not installed. Balance, shards, killstreak and rank will not be sent.");
        }
        if (!configured()) {
            getLogger().severe("Set api-url and api-key in plugins/MangoStatsSync/config.yml, then restart the server.");
            return;
        }
        if (!url.startsWith("https://")) {
            getLogger().warning("api-url is not https. Use https so your API key is encrypted in transit.");
        }
        Bukkit.getScheduler().runTaskTimer(this, this::tick, 100L, interval * 20L);
        getLogger().info("Syncing stats to the website every " + interval + " seconds.");
    }

    private boolean configured() {
        return url.startsWith("http") && !key.isEmpty() && !key.startsWith("PASTE");
    }

    private static Statistic findStat(String... names) {
        for (String n : names) {
            try {
                return Statistic.valueOf(n);
            } catch (IllegalArgumentException ignored) {
                // try the next name
            }
        }
        return null;
    }

    /** Runs on the main server thread: collects stats, then sends them asynchronously. */
    private void tick() {
        if (!configured()) return;
        List<Map<String, Object>> entries = new ArrayList<>();
        List<String> onlineIds = new ArrayList<>();
        Set<UUID> online = new HashSet<>();
        for (Player p : Bukkit.getOnlinePlayers()) {
            online.add(p.getUniqueId());
            onlineIds.add(p.getUniqueId().toString());
            Map<String, Object> e = base(p.getUniqueId(), p.getName());
            e.put("kills", (long) p.getStatistic(Statistic.PLAYER_KILLS));
            e.put("deaths", (long) p.getStatistic(Statistic.DEATHS));
            if (playStat != null) e.put("playtime", p.getStatistic(playStat) / 20L);
            extras(e, p);
            entries.add(e);
        }
        if (sweep > 0) {
            if (cursor >= files.size()) {
                files.clear();
                File dir = statsFolder.isEmpty() ? new File(Bukkit.getWorlds().get(0).getWorldFolder(), "stats") : new File(statsFolder);
                File[] list = dir.listFiles((d, n) -> STAT_FILE.matcher(n).matches());
                if (list != null) Collections.addAll(files, list);
                cursor = 0;
            }
            int done = 0;
            while (cursor < files.size() && done < sweep) {
                File f = files.get(cursor++);
                done++;
                UUID id;
                try {
                    id = UUID.fromString(f.getName().substring(0, 36));
                } catch (IllegalArgumentException ex) {
                    continue;
                }
                if (online.contains(id)) continue;
                OfflinePlayer op = Bukkit.getOfflinePlayer(id);
                String name = op.getName();
                if (name == null) continue;
                try {
                    String txt = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
                    Map<String, Object> e = base(id, name);
                    Long k = find(txt, "minecraft:player_kills"), d = find(txt, "minecraft:deaths");
                    Long t = find(txt, "minecraft:play_time");
                    if (t == null) t = find(txt, "minecraft:play_one_minute");
                    if (k != null) e.put("kills", k);
                    if (d != null) e.put("deaths", d);
                    if (t != null) e.put("playtime", t / 20L);
                    extras(e, op);
                    entries.add(e);
                } catch (Exception ex) {
                    getLogger().fine("Could not read " + f.getName() + ": " + ex.getMessage());
                }
            }
        }
        send(entries, onlineIds, Bukkit.getOnlinePlayers().size());
    }

    private static Map<String, Object> base(UUID id, String name) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("uuid", id.toString());
        e.put("name", name);
        return e;
    }

    private void extras(Map<String, Object> e, OfflinePlayer p) {
        Double bal = number(ph(p, phBalance));
        if (bal != null) e.put("balance", bal);
        Double sh = number(ph(p, phShards));
        if (sh != null) e.put("shards", Math.floor(sh));
        Double ks = number(ph(p, phKillstreak));
        if (ks != null) e.put("killstreak", Math.floor(ks));
        String rank = ph(p, phRank);
        if (rank != null) {
            rank = rank.replaceAll("(?i)[\u00a7&][0-9a-fk-or]", "").trim();
            if (!rank.isEmpty() && !rank.startsWith("%")) e.put("rank", rank.length() > 32 ? rank.substring(0, 32) : rank);
        }
    }

    private String ph(OfflinePlayer p, String template) {
        if (template.isEmpty() || papi == null) return null;
        try {
            Object out = papi.invoke(null, p, template);
            return out == null ? null : out.toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** Accepts only plain numbers such as 1234.5 or 1,234.50. Anything else (for example 1.2K) is ignored, never guessed. */
    private static Double number(String raw) {
        if (raw == null) return null;
        String s = raw.trim().replace(",", "").replace(" ", "").replaceAll("^[$\u20ac\u00a3]", "");
        if (!PLAIN_NUMBER.matcher(s).matches()) return null;
        try {
            double d = Double.parseDouble(s);
            return Double.isFinite(d) ? d : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Long find(String txt, String statKey) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(statKey) + "\"\\s*:\\s*(\\d+)").matcher(txt);
        return m.find() ? Long.valueOf(m.group(1)) : null;
    }

    private void send(List<Map<String, Object>> entries, List<String> onlineIds, int onlineCount) {
        int i = 0;
        do {
            post(entries.subList(i, Math.min(entries.size(), i + 100)), onlineIds, onlineCount);
            i += 100;
        } while (i < entries.size());
    }

    private void post(List<Map<String, Object>> chunk, List<String> onlineIds, int onlineCount) {
        StringBuilder sb = new StringBuilder("{\"online_count\":").append(onlineCount).append(",\"online\":[");
        for (int i = 0; i < Math.min(onlineIds.size(), 270); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(onlineIds.get(i)).append('"');
        }
        sb.append("],\"players\":[");
        boolean first = true;
        for (Map<String, Object> e : chunk) {
            if (!first) sb.append(',');
            first = false;
            sb.append('{');
            boolean f2 = true;
            for (Map.Entry<String, Object> en : e.entrySet()) {
                if (!f2) sb.append(',');
                f2 = false;
                sb.append('"').append(en.getKey()).append("\":");
                Object v = en.getValue();
                if (v instanceof String) sb.append('"').append(esc((String) v)).append('"');
                else if (v instanceof Double) sb.append(String.format(Locale.ROOT, "%.2f", (Double) v));
                else sb.append(v);
            }
            sb.append('}');
        }
        sb.append("]}");
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + key)
                .POST(HttpRequest.BodyPublishers.ofString(sb.toString()))
                .build();
        http.sendAsync(req, HttpResponse.BodyHandlers.ofString()).thenAccept(r -> {
            int code = r.statusCode();
            lastStatus = "HTTP " + code + " (" + chunk.size() + " players) at " + new java.util.Date();
            if (code != lastCode) {
                lastCode = code;
                if (code == 200) getLogger().info("Website accepted the stats sync.");
                else if (code == 401) getLogger().severe("The website rejected the API key (401). Check api-key in config.yml.");
                else getLogger().warning("Website returned HTTP " + code + ": " + r.body());
            }
        }).exceptionally(ex -> {
            lastStatus = "Failed: " + ex.getMessage();
            getLogger().warning("Could not reach the website: " + ex.getMessage());
            return null;
        });
    }

    private static String esc(String s) {
        StringBuilder b = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(' ');
            else b.append(c);
        }
        return b.toString();
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (cmd.getName().equalsIgnoreCase("link")) return link(sender, args);
        if (args.length > 0 && args[0].equalsIgnoreCase("sync")) {
            tick();
            sender.sendMessage("Sync started. Run /mangostats status in a few seconds.");
        } else {
            sender.sendMessage("MangoStatsSync last result: " + lastStatus);
        }
        return true;
    }

    /** /link CODE: proves to the website that this player owns this Minecraft account. */
    private boolean link(CommandSender sender, String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage("Only players can use /link.");
            return true;
        }
        Player p = (Player) sender;
        if (!configured()) {
            p.sendMessage("Account linking is not set up yet. Please tell an admin.");
            return true;
        }
        if (args.length != 1 || !args[0].matches("(?i)[A-Z0-9]{6}")) {
            p.sendMessage("Usage: /link <code>. Get your 6-character code on the MangoSMP website (Account page).");
            return true;
        }
        long nowMs = System.currentTimeMillis();
        Long last = linkCooldown.get(p.getUniqueId());
        if (last != null && nowMs - last < 3000) {
            p.sendMessage("Please wait a few seconds before trying again.");
            return true;
        }
        linkCooldown.put(p.getUniqueId(), nowMs);
        String body = "{\"code\":\"" + args[0].toUpperCase(Locale.ROOT) + "\",\"uuid\":\"" + p.getUniqueId() + "\",\"name\":\"" + esc(p.getName()) + "\"}";
        postLink(p.getUniqueId(), body);
        p.sendMessage("Checking your code...");
        return true;
    }

    private void postLink(UUID id, String body) {
        String linkUrl = url.endsWith("/ingest") ? url.substring(0, url.length() - "/ingest".length()) + "/link/confirm" : url;
        HttpRequest req = HttpRequest.newBuilder(URI.create(linkUrl))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + key)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        http.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenAccept(r -> reply(id, r.statusCode(), r.body()))
                .exceptionally(ex -> {
                    reply(id, 0, "");
                    return null;
                });
    }

    private void reply(UUID id, int code, String body) {
        String msg;
        if (code == 200) {
            msg = "Success! Your Minecraft account is now linked to your Discord account.";
        } else {
            Matcher m = Pattern.compile("\"error\"\\s*:\\s*\"([^\"]*)\"").matcher(body == null ? "" : body);
            msg = m.find() ? m.group(1) : "Could not reach the website. Please try again in a moment.";
        }
        final String out = msg;
        Bukkit.getScheduler().runTask(this, () -> {
            Player pl = Bukkit.getPlayer(id);
            if (pl != null) pl.sendMessage(out);
        });
    }
}
