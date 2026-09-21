import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const boundaries = new Map([
  ["packages/content", new Set()],
  ["packages/protocol", new Set()],
  ["packages/simulation", new Set(["@aeo2/protocol"])],
  ["apps/game", new Set(["@aeo2/content", "@aeo2/protocol", "@aeo2/simulation"])],
  ["apps/server", new Set(["@aeo2/content", "@aeo2/protocol", "@aeo2/simulation"])]
]);

const corePackages = new Set(["packages/content", "packages/protocol", "packages/simulation"]);
const forbiddenCoreDependencies = new Set([
  "react",
  "react-dom",
  "phaser",
  "vite",
  "ws",
  "socket.io",
  "express",
  "fastify"
]);

function collectSourceFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }

    if (/\.(?:[cm]?[jt]sx?)$/.test(entry)) {
      files.push(path);
    }
  }

  return files;
}

function internalImports(source) {
  const imports = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'\n]*?\s+from\s+)?["'](@aeo2\/[a-z0-9-]+)(?:\/[^"']*)?["']/g,
    /\bimport\s*\(\s*["'](@aeo2\/[a-z0-9-]+)(?:\/[^"']*)?["']\s*\)/g,
    /\brequire\s*\(\s*["'](@aeo2\/[a-z0-9-]+)(?:\/[^"']*)?["']\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.add(match[1]);
    }
  }

  return imports;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const violations = [];

for (const [workspace, allowedInternalDependencies] of boundaries) {
  const workspaceRoot = join(repositoryRoot, workspace);

  if (!existsSync(workspaceRoot)) {
    continue;
  }

  const manifestPath = join(workspaceRoot, "package.json");
  if (!existsSync(manifestPath)) {
    violations.push(`${workspace}: missing package.json`);
    continue;
  }

  const manifest = readJson(manifestPath);
  const dependencyGroups = [
    manifest.dependencies ?? {},
    manifest.devDependencies ?? {},
    manifest.peerDependencies ?? {},
    manifest.optionalDependencies ?? {}
  ];

  for (const dependencyGroup of dependencyGroups) {
    for (const dependencyName of Object.keys(dependencyGroup)) {
      if (dependencyName.startsWith("@aeo2/") && !allowedInternalDependencies.has(dependencyName)) {
        violations.push(`${workspace}/package.json: forbidden internal dependency ${dependencyName}`);
      }

      if (corePackages.has(workspace) && forbiddenCoreDependencies.has(dependencyName)) {
        violations.push(
          `${workspace}/package.json: browser/server dependency ${dependencyName} is forbidden in core packages`
        );
      }
    }
  }

  for (const sourceFile of collectSourceFiles(join(workspaceRoot, "src"))) {
    for (const dependencyName of internalImports(readFileSync(sourceFile, "utf8"))) {
      if (!allowedInternalDependencies.has(dependencyName)) {
        violations.push(
          `${relative(repositoryRoot, sourceFile)}: forbidden internal import ${dependencyName}`
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Package boundary violations found:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("Package boundaries OK.");
}
