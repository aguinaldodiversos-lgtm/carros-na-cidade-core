import fs from "node:fs";
import path from "node:path";

const roots = ["src", "frontend", "scripts", "tests"];
const re = /process\.env\.([A-Z0-9_]+)/g;
const set = new Set();

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(js|mjs|ts|tsx)$/.test(name)) {
      const c = fs.readFileSync(full, "utf8");
      let m;
      while ((m = re.exec(c))) set.add(m[1]);
    }
  }
}

for (const r of roots) walk(path.join(process.cwd(), r));
console.log([...set].sort().join("\n"));
