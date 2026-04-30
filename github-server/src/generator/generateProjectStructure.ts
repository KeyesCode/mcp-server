// Top-level orchestrator for the "Standard KeyesCode Web App" template.
//
// As of Phase 4, this accepts a StyleProfile so each sub-generator can adapt
// its output (folder layout, naming convention, import style, etc.). When no
// profile is supplied we use DEFAULT_PROFILE — same output as Phase 3.

import { generateFrontendFiles } from "./generateFrontend.js";
import { generateBackendFiles } from "./generateBackend.js";
import { generateReadme } from "./generateReadme.js";
import { generateEnvExample } from "./generateEnvExample.js";
import {
  DEFAULT_PROFILE,
  type StyleProfile,
} from "./styleProfile.js";

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateOptions {
  projectName: string;
  description?: string;
  includeBackend: boolean;
  includeStripe: boolean;
  /** Style profile that drives folder layout, naming, imports, etc.
   * Defaults to DEFAULT_PROFILE when omitted. */
  profile?: StyleProfile;
}

/** Build the full file set for a "Standard KeyesCode Web App" scaffold. */
export function generateProjectStructure(
  opts: GenerateOptions,
): GeneratedFile[] {
  const profile = opts.profile ?? DEFAULT_PROFILE;
  const files: GeneratedFile[] = [];

  files.push({
    path: "README.md",
    content: generateReadme(opts, profile),
  });
  files.push({
    path: ".env.example",
    content: generateEnvExample(opts),
  });
  files.push({
    path: ".gitignore",
    content: rootGitignore(),
  });

  files.push(...generateFrontendFiles(opts, profile));

  if (opts.includeBackend) {
    files.push(...generateBackendFiles(opts, profile));
  }

  return files;
}

function rootGitignore(): string {
  return `# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
.next/
out/
dist/
build/

# Env
.env
.env*.local

# Logs / OS
*.log
.DS_Store
.idea/
.vscode/
`;
}
