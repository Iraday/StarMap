#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = __dirname;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupDir = path.join(root, "backups", timestamp);
fs.mkdirSync(backupDir, { recursive: true });

const files = ["app.js", "star_data.js", "index.html", "styles.css", "stars_reality.json"];
let copied = 0;
files.forEach((file) => {
  const src = path.join(root, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(backupDir, file));
    copied++;
  }
});

const starDataPath = path.join(root, "star_data.js");
if (fs.existsSync(starDataPath)) {
  const content = fs.readFileSync(starDataPath, "utf-8");
  const starsMatch = content.match(/export\s+const\s+fallbackStars\s*=\s*(\[[\s\S]*?\n\];)/);
  const bodiesMatch = content.match(/export\s+const\s+fallbackBodies\s*=\s*(\{[\s\S]*?\n\};)/);
  const exportData = {
    exportedAt: new Date().toISOString(),
    starCount: (content.match(/"id":/g) || []).length,
    stars: starsMatch ? "see star_data.js" : "not found",
    bodies: bodiesMatch ? "see star_data.js" : "not found"
  };
  fs.writeFileSync(path.join(backupDir, "export-meta.json"), JSON.stringify(exportData, null, 2));
}

console.log(`Backup created: ${backupDir} (${copied} files)`);
