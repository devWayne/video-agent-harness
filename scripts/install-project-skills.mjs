import { cp, mkdir, readdir, rm, symlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(repositoryRoot, "skills");
const requestedHost = process.argv.find((argument) => argument.startsWith("--host="))?.split("=")[1] ?? "all";
const requestedMode = process.argv.includes("--copy")
  ? "copy"
  : process.argv.find((argument) => argument.startsWith("--mode="))?.split("=")[1] ?? "link";
const hostTargets = {
  codex: resolve(repositoryRoot, ".agents/skills"),
  claude: resolve(repositoryRoot, ".claude/skills"),
};

if (!["all", ...Object.keys(hostTargets)].includes(requestedHost)) {
  throw new Error("Use --host=codex, --host=claude, or --host=all");
}

if (!["link", "copy"].includes(requestedMode)) {
  throw new Error("Use --mode=link, --mode=copy, or the --copy alias");
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
    const source = resolve(sourceRoot, skillName);
    const destination = resolve(targetRoot, skillName);

    // Replace only the matching repository-managed skill. Other host-local skills
    // in the target directory are left untouched.
    await rm(destination, { recursive: true, force: true });

    if (requestedMode === "copy") {
      await cp(source, destination, { recursive: true, force: true });
      continue;
    }

    const linkTarget = process.platform === "win32"
      ? source
      : relative(dirname(destination), source);
    await symlink(linkTarget, destination, process.platform === "win32" ? "junction" : "dir");
  }
  const operation = requestedMode === "copy" ? "Copied" : "Linked";
  process.stdout.write(`${operation} ${skillNames.length} repository skills for ${host} at ${targetRoot}\n`);
}
