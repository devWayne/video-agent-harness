import { cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(repositoryRoot, "skills");
const requestedHost = process.argv.find((argument) => argument.startsWith("--host="))?.split("=")[1] ?? "all";
const hostTargets = {
  codex: resolve(repositoryRoot, ".agents/skills"),
  claude: resolve(repositoryRoot, ".claude/skills"),
};

if (!["all", ...Object.keys(hostTargets)].includes(requestedHost)) {
  throw new Error("Use --host=codex, --host=claude, or --host=all");
}

const skillNames = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const selectedTargets = Object.entries(hostTargets).filter(
  ([host]) => requestedHost === "all" || requestedHost === host,
);

for (const [host, targetRoot] of selectedTargets) {
  await mkdir(targetRoot, { recursive: true });
  for (const skillName of skillNames) {
    await cp(resolve(sourceRoot, skillName), resolve(targetRoot, skillName), {
      recursive: true,
      force: true,
    });
  }
  process.stdout.write(`Installed ${skillNames.length} repository skills for ${host} at ${targetRoot}\n`);
}
