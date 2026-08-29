import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
}

walk(publicRoot);
const textFiles = files.filter((path) => [".html", ".js", ".css"].includes(extname(path)));
const problems = [];
for (const path of textFiles) {
  const source = readFileSync(path, "utf8");
  if (/(['"`])\/api\//.test(source)) {
    problems.push(`${path}: still references the retired Express API`);
  }
  if (/ChangeMe123|service_role/i.test(source)) {
    problems.push(`${path}: contains a forbidden production credential marker`);
  }
  if (/href="\/(?!\/)|src="\/(?!\/)/.test(source)) {
    problems.push(`${path}: contains a root-relative asset or page URL`);
  }
}

const required = [
  "index.html",
  "app.js",
  "config.js",
  "supabase-client.js",
  "CNAME",
  ".nojekyll",
];
for (const name of required) {
  if (!files.includes(join(publicRoot, name))) {
    problems.push(`Missing required file: public/${name}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`Static validation passed for ${files.length} public files.`);
