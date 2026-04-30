// Extract a "style profile" from a set of reference repos so the generator
// can adapt its output to look like code I actually write.
//
// Design notes:
//   - We never copy code. We extract *signals* (which dirs exist, what
//     casing component files use, default vs. named export, absolute vs.
//     relative imports) and aggregate them.
//   - We aggregate inclusively for *structure* (any ref has hooks/ →
//     hooks/) and by majority vote for *conventions* — that prevents
//     overfitting to one repo's quirks while still picking up common
//     patterns.
//   - Read-only. Uses the same primitives as the read tools.

import { fetchRepoTree } from "../utils/repoTree.js";
import { readRepoFile } from "../utils/fileSafety.js";

export interface StyleProfile {
  framework: "nextjs" | "vite-react" | "unknown";
  structure: {
    hasComponentsDir: boolean;
    hasLibDir: boolean;
    hasHooksDir: boolean;
    hasServicesDir: boolean;
    hasUtilsDir: boolean;
    /** components/ui/ subdir (shadcn-style). */
    hasUiSubdir: boolean;
    /** Whether code lives under src/. Affects every emitted path. */
    useSrcDir: boolean;
  };
  conventions: {
    /** How component file names look on disk. */
    fileNaming: "kebab-case" | "PascalCase" | "camelCase";
    /** Whether components are exported via `export default` or named export. */
    componentStyle: "default-export" | "named-export";
    /** Whether imports use a path alias (@/...) or relative paths. */
    imports: "absolute" | "relative";
  };
  styling: {
    tailwind: boolean;
    pattern: "utility-first" | "css-modules" | "unknown";
  };
  /** "owner/repo" strings of refs that contributed signals. */
  sources: string[];
  /** Free-text bullets explaining each non-default decision. Embedded in
   * the generated README so the developer can see *why* the structure
   * looks the way it does. */
  rationale: string[];
}

/** What the generator falls back to when no refs are supplied or none can
 * be analysed. Matches the original Phase-3 output. */
export const DEFAULT_PROFILE: StyleProfile = {
  framework: "nextjs",
  structure: {
    hasComponentsDir: true,
    hasLibDir: true,
    hasHooksDir: false,
    hasServicesDir: false,
    hasUtilsDir: false,
    hasUiSubdir: true,
    useSrcDir: false,
  },
  conventions: {
    fileNaming: "PascalCase",
    componentStyle: "default-export",
    imports: "absolute",
  },
  styling: { tailwind: true, pattern: "utility-first" },
  sources: [],
  rationale: [
    "No style references supplied — using sensible defaults for the Standard KeyesCode Web App template.",
  ],
};

// ---------------------------------------------------------------------------
// Per-repo signal collection
// ---------------------------------------------------------------------------

interface RepoSignals {
  ref: string;
  framework: "nextjs" | "vite-react" | "unknown";
  hasComponentsDir: boolean;
  hasLibDir: boolean;
  hasHooksDir: boolean;
  hasServicesDir: boolean;
  hasUtilsDir: boolean;
  hasUiSubdir: boolean;
  useSrcDir: boolean;
  /** Component file basenames (e.g. `Header.tsx`, `dropdown-menu.tsx`). */
  componentFileNames: string[];
  /** Up to 2 small component file contents, used to sniff export/import style. */
  componentSamples: string[];
  tailwind: boolean;
  hasPathAliases: boolean;
}

async function extractRepoSignals(ref: string): Promise<RepoSignals | null> {
  const m = ref.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) return null;
  const [, owner, repo] = m;

  const signals: RepoSignals = {
    ref,
    framework: "unknown",
    hasComponentsDir: false,
    hasLibDir: false,
    hasHooksDir: false,
    hasServicesDir: false,
    hasUtilsDir: false,
    hasUiSubdir: false,
    useSrcDir: false,
    componentFileNames: [],
    componentSamples: [],
    tailwind: false,
    hasPathAliases: false,
  };

  let tree: Awaited<ReturnType<typeof fetchRepoTree>>;
  try {
    tree = await fetchRepoTree({ owner, repo });
  } catch {
    return null; // Repo unreachable — skip silently.
  }

  // package.json → framework + tailwind.
  try {
    const pkg = await readRepoFile({ owner, repo, path: "package.json" });
    if (!pkg.binary && pkg.text) {
      const parsed = JSON.parse(pkg.text) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...parsed.dependencies, ...parsed.devDependencies };
      if (deps["next"]) signals.framework = "nextjs";
      else if (deps["vite"] && deps["react"]) signals.framework = "vite-react";
      if (deps["tailwindcss"]) signals.tailwind = true;
    }
  } catch {
    /* skip */
  }

  // tsconfig.json → path aliases (JSONC, so strip comments before parsing).
  try {
    const tsc = await readRepoFile({ owner, repo, path: "tsconfig.json" });
    if (!tsc.binary && tsc.text) {
      const stripped = tsc.text
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      try {
        const parsed = JSON.parse(stripped) as {
          compilerOptions?: { paths?: Record<string, string[]> };
        };
        if (parsed?.compilerOptions?.paths) signals.hasPathAliases = true;
      } catch {
        /* malformed JSONC — skip */
      }
    }
  } catch {
    /* skip */
  }

  // Tree-derived signals.
  const paths = tree.entries.map((e) => e.path);
  const dirExists = (suffix: string) =>
    paths.some((p) => p === suffix || p.startsWith(suffix + "/"));

  signals.useSrcDir = dirExists("src");
  const root = signals.useSrcDir ? "src/" : "";

  signals.hasComponentsDir = dirExists(`${root}components`);
  signals.hasLibDir = dirExists(`${root}lib`);
  signals.hasHooksDir = dirExists(`${root}hooks`);
  signals.hasServicesDir = dirExists(`${root}services`);
  signals.hasUtilsDir = dirExists(`${root}utils`);
  signals.hasUiSubdir = dirExists(`${root}components/ui`);

  // Component file basenames — used to detect naming convention.
  const componentDirPrefix = `${root}components/`;
  signals.componentFileNames = tree.entries
    .filter(
      (e) =>
        e.type === "file" &&
        e.path.startsWith(componentDirPrefix) &&
        /\.(tsx|jsx)$/.test(e.path),
    )
    .map((e) => e.path.slice(componentDirPrefix.length))
    // Drop any that live in a sub-sub-folder; we want names from
    // `components/Foo.tsx`, not `components/ui/foo.tsx`.
    .filter((p) => !p.includes("/"))
    .slice(0, 30);

  // Sample 1–2 small component files to sniff export/import style.
  const candidates = tree.entries
    .filter(
      (e) =>
        e.type === "file" &&
        e.path.startsWith(componentDirPrefix) &&
        /\.(tsx|jsx)$/.test(e.path) &&
        e.size != null &&
        e.size < 5000,
    )
    .sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
    .slice(0, 2);
  for (const c of candidates) {
    try {
      const file = await readRepoFile({ owner, repo, path: c.path });
      if (!file.binary && file.text) signals.componentSamples.push(file.text);
    } catch {
      /* skip */
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Detection helpers (work on aggregated input)
// ---------------------------------------------------------------------------

function detectFileNaming(
  names: string[],
): "kebab-case" | "PascalCase" | "camelCase" {
  if (names.length === 0) return "PascalCase";
  let pascal = 0;
  let lowercase = 0;
  let hasHyphen = 0;
  for (const name of names) {
    const base = name.replace(/\.[^.]+$/, "");
    if (/^[A-Z]/.test(base)) pascal++;
    else if (/^[a-z]/.test(base)) {
      lowercase++;
      if (base.includes("-")) hasHyphen++;
    }
  }
  if (pascal > lowercase) return "PascalCase";
  // If all lowercase with at least one hyphen → kebab. Otherwise it's
  // ambiguous between kebab (single-word names just don't need hyphens)
  // and camelCase. Default to kebab — more common in modern Next.js.
  if (hasHyphen > 0 || lowercase > 0) return "kebab-case";
  return "PascalCase";
}

function detectComponentAndImportStyle(samples: string[]): {
  componentStyle: "default-export" | "named-export";
  imports: "absolute" | "relative";
} {
  let defaultExport = 0;
  let namedExport = 0;
  let absoluteImport = 0;
  let relativeImport = 0;

  for (const sample of samples) {
    if (/^export\s+default\s+(function|async\s+function|const)\s/m.test(sample)) {
      defaultExport++;
    } else if (
      // Named export with no matching default-export elsewhere in the file.
      /^export\s+(function|const|class)\s+[A-Z]/m.test(sample) &&
      !/^export\s+default/m.test(sample)
    ) {
      namedExport++;
    }

    for (const line of sample.split("\n")) {
      const m = line.match(/from\s+["']([^"']+)["']/);
      if (!m) continue;
      const path = m[1];
      if (path.startsWith("@/") || path.startsWith("~/")) absoluteImport++;
      else if (path.startsWith("./") || path.startsWith("../")) relativeImport++;
    }
  }

  return {
    componentStyle:
      namedExport > defaultExport ? "named-export" : "default-export",
    imports: relativeImport > absoluteImport ? "relative" : "absolute",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Extract and merge a style profile from the supplied refs. Returns
 * DEFAULT_PROFILE if no refs given or none could be analysed. */
export async function extractStyleProfile(
  refs: string[],
): Promise<StyleProfile> {
  if (refs.length === 0) return DEFAULT_PROFILE;

  const all = (
    await Promise.all(refs.map((r) => extractRepoSignals(r)))
  ).filter((s): s is RepoSignals => s !== null);

  if (all.length === 0) {
    return {
      ...DEFAULT_PROFILE,
      sources: [],
      rationale: [
        `Style references supplied (${refs.join(", ")}) but none could be analysed; using defaults.`,
      ],
    };
  }

  // Structure: aggregate inclusively. If *any* ref has hooks/, we include
  // hooks/ in the output. This keeps the generator from missing useful
  // dirs just because one ref didn't happen to have them.
  const structure = {
    hasComponentsDir: all.some((s) => s.hasComponentsDir),
    hasLibDir: all.some((s) => s.hasLibDir),
    hasHooksDir: all.some((s) => s.hasHooksDir),
    hasServicesDir: all.some((s) => s.hasServicesDir),
    hasUtilsDir: all.some((s) => s.hasUtilsDir),
    hasUiSubdir: all.some((s) => s.hasUiSubdir),
    useSrcDir: all.some((s) => s.useSrcDir),
  };

  // Conventions: aggregate by majority vote over the union of evidence.
  const fileNaming = detectFileNaming(all.flatMap((s) => s.componentFileNames));
  const detected = detectComponentAndImportStyle(
    all.flatMap((s) => s.componentSamples),
  );

  // Safety: don't emit `@/foo` imports if no ref actually configures path
  // aliases — those would fail `tsc` in the generated repo.
  const noneHaveAliases = !all.some((s) => s.hasPathAliases);
  const finalImports =
    detected.imports === "absolute" && noneHaveAliases
      ? "relative"
      : detected.imports;

  const tailwind = all.some((s) => s.tailwind);
  // Prefer nextjs if any ref uses it; otherwise vite-react if any does.
  const framework: StyleProfile["framework"] = all.some(
    (s) => s.framework === "nextjs",
  )
    ? "nextjs"
    : all.some((s) => s.framework === "vite-react")
      ? "vite-react"
      : "nextjs"; // safe default since our template is Next-shaped

  // Build a human-readable rationale.
  const rationale: string[] = [];
  rationale.push(
    `Analysed ${all.length} of ${refs.length} style reference(s): ${all.map((s) => s.ref).join(", ")}.`,
  );
  rationale.push(
    `File-naming convention "${fileNaming}" inferred from ${all.flatMap((s) => s.componentFileNames).length} component file name(s).`,
  );
  rationale.push(
    `Component style "${detected.componentStyle}" and import style "${finalImports}" inferred from ${all.flatMap((s) => s.componentSamples).length} sample component file(s).`,
  );
  if (finalImports !== detected.imports) {
    rationale.push(
      `Imports downgraded from absolute → relative because no reference repo configured path aliases in tsconfig.json.`,
    );
  }
  const optionalDirs = [
    structure.hasHooksDir && "hooks/",
    structure.hasServicesDir && "services/",
    structure.hasUtilsDir && "utils/",
    structure.hasUiSubdir && "components/ui/",
    structure.useSrcDir && "src/",
  ].filter(Boolean);
  rationale.push(
    `Optional dirs included: ${optionalDirs.length ? optionalDirs.join(", ") : "(none beyond components/ + lib/)"}.`,
  );

  return {
    framework,
    structure,
    conventions: {
      fileNaming,
      componentStyle: detected.componentStyle,
      imports: finalImports,
    },
    styling: {
      tailwind,
      pattern: tailwind ? "utility-first" : "unknown",
    },
    sources: all.map((s) => s.ref),
    rationale,
  };
}
