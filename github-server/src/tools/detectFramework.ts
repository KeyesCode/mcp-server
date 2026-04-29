// Tool: detect_framework
//
// First tries package.json: maps known dep names to friendly framework
// labels. If no JS framework is found, falls back to scanning the repo
// tree for non-JS manifest files (Cargo.toml, go.mod, etc).

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { readRepoFile } from "../utils/fileSafety.js";
import { fetchRepoTree } from "../utils/repoTree.js";
import { logToolCall } from "../server.js";

/** Map: dep name → friendly label. Order matters slightly — the first
 * match wins for "primary framework", though we list them all. */
const JS_FRAMEWORK_DEPS: Array<[string, string]> = [
  ["next", "Next.js"],
  ["nuxt", "Nuxt"],
  ["@nestjs/core", "NestJS"],
  ["@remix-run/react", "Remix"],
  ["@sveltejs/kit", "SvelteKit"],
  ["astro", "Astro"],
  ["gatsby", "Gatsby"],
  ["expo", "Expo (React Native)"],
  ["react-native", "React Native"],
  ["@angular/core", "Angular"],
  ["solid-js", "SolidJS"],
  ["@builder.io/qwik", "Qwik"],
  ["hono", "Hono"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["@hapi/hapi", "Hapi"],
  ["koa", "Koa"],
  ["electron", "Electron"],
  ["react", "React (library)"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["vite", "Vite (build tool)"],
];

/** Files that signal a non-JS project. */
const NON_JS_MANIFESTS: Array<[string, string]> = [
  ["Cargo.toml", "Rust (Cargo)"],
  ["pyproject.toml", "Python (pyproject)"],
  ["requirements.txt", "Python (pip)"],
  ["setup.py", "Python (setuptools)"],
  ["Pipfile", "Python (pipenv)"],
  ["go.mod", "Go modules"],
  ["Gemfile", "Ruby"],
  ["pom.xml", "Java (Maven)"],
  ["build.gradle", "JVM (Gradle)"],
  ["build.gradle.kts", "JVM (Gradle Kotlin)"],
  ["Package.swift", "Swift"],
  ["mix.exs", "Elixir (Mix)"],
  ["composer.json", "PHP (Composer)"],
  ["pubspec.yaml", "Dart / Flutter"],
];

export function registerDetectFrameworkTool(server: McpServer): void {
  server.registerTool(
    "detect_framework",
    {
      title: "Detect Framework",
      description:
        "Detects which framework(s) a repo uses. Inspects package.json deps first, then falls back to manifest files for non-JS projects.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
      },
    },
    async ({ owner, repo }) => {
      try {
        const target = resolveRepo(owner, repo);
        logToolCall("detect_framework", target);

        const detected: string[] = [];

        // Try package.json (most repos in scope are JS/TS).
        let pkgFound = false;
        try {
          const file = await readRepoFile({ ...target, path: "package.json" });
          if (!file.binary && file.text) {
            pkgFound = true;
            const parsed = JSON.parse(file.text) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            const allDeps = {
              ...parsed.dependencies,
              ...parsed.devDependencies,
            };
            for (const [dep, label] of JS_FRAMEWORK_DEPS) {
              if (allDeps[dep]) {
                detected.push(`${label}  (${dep}@${allDeps[dep]})`);
              }
            }
          }
        } catch {
          // package.json not present — that's fine, we'll fall through.
        }

        // Fall back to non-JS manifests if we found nothing JS-y.
        if (!pkgFound || detected.length === 0) {
          try {
            const { entries } = await fetchRepoTree(target);
            const top = new Set(
              entries
                .filter((e) => !e.path.includes("/"))
                .map((e) => e.path),
            );
            for (const [filename, label] of NON_JS_MANIFESTS) {
              if (top.has(filename)) detected.push(`${label}  (${filename})`);
            }
          } catch {
            // Tree fetch failed — surface package.json result alone.
          }
        }

        const text =
          detected.length > 0
            ? `Detected frameworks / runtimes:\n${detected.map((d) => `- ${d}`).join("\n")}`
            : "No known framework detected. Tried package.json deps and common non-JS manifest files.";
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "detect_framework"));
      }
    },
  );
}
