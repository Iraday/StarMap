#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = __dirname;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupDir = path.join(root, "backups", timestamp);
fs.mkdirSync(backupDir, { recursive: true });

const files = ["app.js", "ships.js", "star_data.js", "index.html", "styles.css", "stars_reality.json", "README.md"];
let copied = 0;
files.forEach((file) => {
  const src = path.join(root, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(backupDir, file));
    copied++;
  }
});

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) count += copyDir(from, to);
    else {
      fs.copyFileSync(from, to);
      count++;
    }
  }
  return count;
}

copied += copyDir(path.join(root, "saves"), path.join(backupDir, "saves"));
copied += copyDir(path.join(root, "data"), path.join(backupDir, "data"));

const starDataPath = path.join(root, "star_data.js");
if (fs.existsSync(starDataPath)) {
  const content = fs.readFileSync(starDataPath, "utf-8");
  const starsMatch = content.match(/export\s+const\s+fallbackStars\s*=\s*(\[[\s\S]*?\n\];)/);
  const bodiesMatch = content.match(/export\s+const\s+fallbackBodies\s*=\s*(\{[\s\S]*?\n\};)/);
  const exportData = {
    exportedAt: new Date().toISOString(),
    starCount: (content.match(/"id":/g) || []).length,
    saveCount: fs.existsSync(path.join(root, "saves"))
      ? fs.readdirSync(path.join(root, "saves")).filter((name) => name.endsWith(".json")).length
      : 0,
    stars: starsMatch ? "see star_data.js" : "not found",
    bodies: bodiesMatch ? "see star_data.js" : "not found"
  };
  fs.writeFileSync(path.join(backupDir, "export-meta.json"), JSON.stringify(exportData, null, 2));
}

console.log(`Backup created: ${backupDir} (${copied} files)`);
