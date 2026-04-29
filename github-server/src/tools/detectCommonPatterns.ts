// Tool: detect_common_patterns
//
// Heuristic scanner: combines package.json deps and the repo tree to spot
// well-known patterns (auth, payments, ORM, testing, etc). For each
// category we collect both *dep* signals and *path* signals so the LLM
// gets a rationale for each match instead of a yes/no answer.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { readRepoFile } from "../utils/fileSafety.js";
import { fetchRepoTree } from "../utils/repoTree.js";
import { logToolCall } from "../server.js";

interface Signal {
  /** Dependency name to look for in package.json. */
  dep?: string;
  /** Substring (lower-case) to look for in any tree path. */
  path?: string;
}

interface Category {
  name: string;
  signals: Signal[];
}

const CATEGORIES: Category[] = [
  {
    name: "Authentication",
    signals: [
      { dep: "next-auth" },
      { dep: "better-auth" },
      { dep: "lucia" },
      { dep: "passport" },
      { dep: "@auth/core" },
      { dep: "@clerk/nextjs" },
      { dep: "@clerk/clerk-react" },
      { dep: "@auth0/nextjs-auth0" },
      { dep: "@supabase/auth-helpers-nextjs" },
      { dep: "firebase/auth" },
      { dep: "iron-session" },
      { dep: "jsonwebtoken" },
      { path: "/(auth)/" },
      { path: "/auth/" },
      { path: "middleware/auth" },
      { path: "guards/" },
    ],
  },
  {
    name: "Payments / Stripe",
    signals: [
      { dep: "stripe" },
      { dep: "@stripe/stripe-js" },
      { dep: "@stripe/react-stripe-js" },
      { path: "stripe" },
      { path: "checkout" },
      { path: "billing" },
      { path: "webhooks/stripe" },
    ],
  },
  {
    name: "API structure",
    signals: [
      { path: "app/api/" },
      { path: "pages/api/" },
      { path: "src/api/" },
      { path: "routes/" },
      { path: "controllers/" },
      { path: "handlers/" },
      { path: "openapi" },
      { path: "swagger" },
      { dep: "trpc" },
      { dep: "@trpc/server" },
      { dep: "graphql" },
      { dep: "@apollo/server" },
    ],
  },
  {
    name: "Database / ORM",
    signals: [
      { dep: "@prisma/client" },
      { dep: "prisma" },
      { dep: "drizzle-orm" },
      { dep: "typeorm" },
      { dep: "mongoose" },
      { dep: "sequelize" },
      { dep: "kysely" },
      { dep: "@supabase/supabase-js" },
      { dep: "pg" },
      { dep: "mysql2" },
      { path: "prisma/schema.prisma" },
      { path: "drizzle.config" },
      { path: "migrations/" },
      { path: "/db/" },
      { path: "/database/" },
    ],
  },
  {
    name: "Testing",
    signals: [
      { dep: "vitest" },
      { dep: "jest" },
      { dep: "mocha" },
      { dep: "@playwright/test" },
      { dep: "cypress" },
      { dep: "@testing-library/react" },
      { dep: "@testing-library/dom" },
      { path: "__tests__/" },
      { path: ".test." },
      { path: ".spec." },
      { path: "e2e/" },
      { path: "cypress/" },
      { path: "playwright.config" },
    ],
  },
  {
    name: "Validation",
    signals: [
      { dep: "zod" },
      { dep: "valibot" },
      { dep: "yup" },
      { dep: "joi" },
      { dep: "class-validator" },
      { dep: "@sinclair/typebox" },
    ],
  },
  {
    name: "State / data fetching",
    signals: [
      { dep: "zustand" },
      { dep: "jotai" },
      { dep: "recoil" },
      { dep: "redux" },
      { dep: "@reduxjs/toolkit" },
      { dep: "@tanstack/react-query" },
      { dep: "swr" },
    ],
  },
  {
    name: "Styling",
    signals: [
      { dep: "tailwindcss" },
      { dep: "@emotion/react" },
      { dep: "styled-components" },
      { dep: "sass" },
      { dep: "vanilla-extract" },
    ],
  },
  {
    name: "CI / DevOps signals",
    signals: [
      { path: ".github/workflows/" },
      { path: "Dockerfile" },
      { path: "docker-compose" },
      { path: "fly.toml" },
      { path: "vercel.json" },
      { path: "netlify.toml" },
      { path: "render.yaml" },
      { path: "terraform/" },
    ],
  },
];

export function registerDetectCommonPatternsTool(server: McpServer): void {
  server.registerTool(
    "detect_common_patterns",
    {
      title: "Detect Common Patterns",
      description:
        "Scans package.json + the repo tree for known patterns: auth, payments, API structure, database/ORM, testing, validation, state, styling, CI/DevOps. Reports matches with rationale.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
      },
    },
    async ({ owner, repo }) => {
      try {
        const target = resolveRepo(owner, repo);
        logToolCall("detect_common_patterns", target);

        // Fetch package.json and the tree concurrently — they're independent.
        const [pkgResult, treeResult] = await Promise.allSettled([
          readRepoFile({ ...target, path: "package.json" }),
          fetchRepoTree(target),
        ]);

        let allDeps: Record<string, string> = {};
        if (
          pkgResult.status === "fulfilled" &&
          !pkgResult.value.binary &&
          pkgResult.value.text
        ) {
          try {
            const parsed = JSON.parse(pkgResult.value.text) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            allDeps = {
              ...parsed.dependencies,
              ...parsed.devDependencies,
            };
          } catch {
            /* malformed package.json — skip dep matching, keep tree matching */
          }
        }

        const lowerPaths =
          treeResult.status === "fulfilled"
            ? treeResult.value.entries.map((e) => e.path.toLowerCase())
            : [];

        const sections: string[] = [];
        for (const cat of CATEGORIES) {
          const matches = collectMatches(allDeps, lowerPaths, cat.signals);
          if (matches.length === 0) continue;
          sections.push(
            `## ${cat.name}\n${matches.map((m) => `- ${m}`).join("\n")}`,
          );
        }

        const header = `# Patterns in ${target.owner}/${target.repo}\n`;
        const footer: string[] = [];
        if (pkgResult.status === "rejected") {
          footer.push("(Note: package.json could not be read.)");
        }
        if (treeResult.status === "rejected") {
          footer.push("(Note: repo tree could not be fetched.)");
        }
        if (
          treeResult.status === "fulfilled" &&
          treeResult.value.truncatedByUs
        ) {
          footer.push(
            "(Note: the tree was truncated — patterns deep in the repo may have been missed.)",
          );
        }

        const text =
          sections.length > 0
            ? [header, ...sections, ...footer].filter(Boolean).join("\n\n")
            : [
                header,
                "No known patterns detected from package.json or the tree.",
                ...footer,
              ]
                .filter(Boolean)
                .join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolErrorResult(
          formatGithubError(err, "detect_common_patterns"),
        );
      }
    },
  );
}

function collectMatches(
  deps: Record<string, string>,
  lowerPaths: string[],
  signals: Signal[],
): string[] {
  const matches = new Set<string>();
  for (const sig of signals) {
    if (sig.dep && deps[sig.dep]) {
      matches.add(`dep: ${sig.dep}@${deps[sig.dep]}`);
    }
    if (sig.path) {
      const needle = sig.path.toLowerCase();
      const found = lowerPaths.find((p) => p.includes(needle));
      if (found) matches.add(`path: ${found}`);
    }
  }
  return [...matches];
}
