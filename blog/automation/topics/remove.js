#!/usr/bin/env node
"use strict";

// =========================================================================
// remove.js — supprime proprement un sujet partout
// -------------------------------------------------------------------------
// Cible :
//   - configs/<slug>.js                            (fichier supprimé)
//   - topics + posts + articles dans la BDD blog    (cascade déjà câblé)
//
// Usage :
//   node blog/automation/topics/remove.js <slug>
//   node blog/automation/topics/remove.js <slug> --yes   (sans confirmation)
//
// Tu peux toujours ré-importer le sujet plus tard avec new.js puis un
// `docker compose restart blog`.
// =========================================================================

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2).filter((a) => a !== "--yes");
const skipConfirm = process.argv.includes("--yes");
const slug = args[0];

if (!slug) {
  console.error("Usage : node blog/automation/topics/remove.js <slug> [--yes]");
  process.exit(1);
}

const configPath = path.join(__dirname, "configs", `${slug}.js`);
const PG_USER = process.env.POSTGRES_USER || "patchnotes";
const BLOG_DB = process.env.BLOG_DB || "patch_notes";

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function exec(sql) {
  const r = spawnSync("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", PG_USER, "-d", BLOG_DB, "-tA"], {
    input: sql,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`psql failed (${r.status}) sur ${BLOG_DB} : ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

async function confirm(prompt) {
  if (skipConfirm) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function main() {
  const postCount = exec(`SELECT COUNT(*)::int FROM posts WHERE topic_slug = ${quote(slug)};`);

  console.log(`\nSujet à supprimer : ${slug}`);
  console.log(`  configs/${slug}.js : ${fs.existsSync(configPath) ? "présent" : "absent"}`);
  console.log(`  posts en BDD blog  : ${postCount}\n`);

  const ok = await confirm(`Confirmer la suppression définitive de "${slug}" (config + posts + articles) ?`);
  if (!ok) {
    console.log("Annulé.");
    return;
  }

  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
    console.log(`✓ configs/${slug}.js supprimé`);
  }

  exec(`DELETE FROM topics WHERE slug = ${quote(slug)};`);
  console.log(`✓ topic blog ${slug} supprimé (cascade posts + articles)`);

  console.log("\nFini. Relance `docker compose restart blog` pour que le scheduler arrête ce sujet.");
}

main().catch((err) => {
  console.error("Erreur :", err.message);
  process.exit(1);
});
