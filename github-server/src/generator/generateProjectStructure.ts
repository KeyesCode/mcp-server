// Top-level orchestrator for the "Standard KeyesCode Web App" template.
//
// Each sub-generator returns an array of `{ path, content }` records. We
// concatenate them and the orchestrator hands the result to commit_files.
//
// Adding a new template is a matter of writing a new orchestrator that
// composes different sub-generators (or a different one entirely).

import { generateFrontendFiles } from "./generateFrontend.js";
import { generateBackendFiles } from "./generateBackend.js";
import { generateReadme } from "./generateReadme.js";
import { generateEnvExample } from "./generateEnvExample.js";

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateOptions {
  projectName: string;
  description?: string;
  includeBackend: boolean;
  includeStripe: boolean;
  /** Free-form notes from analysing style-reference repos. Embedded in the README so the
   * developer can see what shaped the output. */
  styleNotes?: string[];
}

/** Build the full file set for a "Standard KeyesCode Web App" scaffold. */
export function generateProjectStructure(
  opts: GenerateOptions,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Common root files.
  files.push({
    path: "README.md",
    content: generateReadme(opts),
  });
  files.push({
    path: ".env.example",
    content: generateEnvExample(opts),
  });
  files.push({
    path: ".gitignore",
    content: rootGitignore(),
  });

  // Frontend (always present).
  files.push(...generateFrontendFiles(opts));

  // Backend (optional).
  if (opts.includeBackend) {
    files.push(...generateBackendFiles(opts));
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
