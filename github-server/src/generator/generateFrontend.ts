// Generates the Next.js (App Router) + Tailwind frontend file set, adapted
// to a StyleProfile.
//
// What the profile controls:
//   - useSrcDir         → everything under src/ vs at root
//   - hasUiSubdir       → Button at components/ui/ vs components/
//   - hasHooksDir       → emit a hooks/use-example.ts
//   - hasServicesDir    → emit a services/api.ts
//   - fileNaming        → Header.tsx vs header.tsx (kebab) vs header.tsx (camel)
//   - componentStyle    → `export default function X` vs `export function X`
//   - imports           → `@/components/...` vs `../components/...`
//
// We compute paths once into a manifest and then render every file from
// that manifest, so imports always point at where files actually live.

import path from "node:path";
import type {
  GeneratedFile,
  GenerateOptions,
} from "./generateProjectStructure.js";
import type { StyleProfile } from "./styleProfile.js";

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

/** Convert a logical PascalCase name into the on-disk basename for the
 * configured convention. Extension is added by the caller. */
function fileBaseFor(logicalName: string, profile: StyleProfile): string {
  switch (profile.conventions.fileNaming) {
    case "kebab-case":
      // PascalCase → kebab: insert "-" between adjacent lower→upper, lowercase.
      return logicalName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    case "camelCase":
      return logicalName.charAt(0).toLowerCase() + logicalName.slice(1);
    case "PascalCase":
    default:
      return logicalName;
  }
}

/** Build an import statement that respects componentStyle + imports. */
function importStatement(
  logicalName: string,
  fromFile: string,
  toFile: string,
  profile: StyleProfile,
): string {
  // Strip extension from the import target (TS resolves it).
  const targetNoExt = toFile.replace(/\.(tsx|ts|jsx|js)$/, "");
  let importPath: string;
  if (profile.conventions.imports === "absolute") {
    // Path alias rooted at "@/" maps to the project root (or src/ if useSrcDir).
    const rootPrefix = profile.structure.useSrcDir ? "src/" : "";
    importPath = `@/${targetNoExt.replace(rootPrefix, "")}`;
  } else {
    const rel = path.posix.relative(path.posix.dirname(fromFile), targetNoExt);
    importPath = rel.startsWith(".") ? rel : "./" + rel;
  }
  if (profile.conventions.componentStyle === "default-export") {
    return `import ${logicalName} from "${importPath}";`;
  }
  return `import { ${logicalName} } from "${importPath}";`;
}

/** Build the export prefix for a component definition. */
function componentExportPrefix(
  logicalName: string,
  profile: StyleProfile,
): string {
  if (profile.conventions.componentStyle === "default-export") {
    return `export default function ${logicalName}`;
  }
  return `export function ${logicalName}`;
}

/** Build a manifest mapping each logical name to its on-disk path. */
interface FrontendPaths {
  rootPrefix: string; // "" or "src/"
  layoutPath: string;
  pagePath: string;
  globalsCssPath: string;
  headerPath: string;
  footerPath: string;
  buttonPath: string;
  cnPath: string;
  stripeLibPath?: string;
  stripeRoutePath?: string;
  hookPath?: string;
  servicePath?: string;
}

function buildPaths(
  profile: StyleProfile,
  opts: GenerateOptions,
): FrontendPaths {
  const root = profile.structure.useSrcDir ? "src/" : "";
  const componentsDir = `${root}components/`;
  const buttonDir = profile.structure.hasUiSubdir
    ? `${componentsDir}ui/`
    : componentsDir;
  const libDir = `${root}lib/`;

  const paths: FrontendPaths = {
    rootPrefix: root,
    layoutPath: `${root}app/layout.tsx`,
    pagePath: `${root}app/page.tsx`,
    globalsCssPath: `${root}app/globals.css`,
    headerPath: `${componentsDir}${fileBaseFor("Header", profile)}.tsx`,
    footerPath: `${componentsDir}${fileBaseFor("Footer", profile)}.tsx`,
    buttonPath: `${buttonDir}${fileBaseFor("Button", profile)}.tsx`,
    cnPath: `${libDir}cn.ts`,
  };

  if (opts.includeStripe) {
    paths.stripeLibPath = `${libDir}stripe.ts`;
    paths.stripeRoutePath = `${root}app/api/stripe/checkout/route.ts`;
  }
  if (profile.structure.hasHooksDir) {
    paths.hookPath = `${root}hooks/${fileBaseFor("useExample", profile)}.ts`;
  }
  if (profile.structure.hasServicesDir) {
    paths.servicePath = `${root}services/${fileBaseFor("api", profile)}.ts`;
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function generateFrontendFiles(
  opts: GenerateOptions,
  profile: StyleProfile,
): GeneratedFile[] {
  const paths = buildPaths(profile, opts);
  const files: GeneratedFile[] = [];

  // Root config files (always at repo root, not under src/).
  files.push({ path: "package.json", content: rootPackageJson(opts) });
  files.push({ path: "tsconfig.json", content: tsconfig(profile) });
  files.push({ path: "next.config.mjs", content: nextConfig() });
  files.push({ path: "tailwind.config.ts", content: tailwindConfig(profile) });
  files.push({ path: "postcss.config.mjs", content: postcssConfig() });
  files.push({ path: "next-env.d.ts", content: nextEnvDts() });

  // App + components.
  files.push({ path: paths.globalsCssPath, content: globalsCss() });
  files.push({
    path: paths.layoutPath,
    content: layoutTsx(opts, profile, paths),
  });
  files.push({
    path: paths.pagePath,
    content: pageTsx(opts, profile, paths),
  });
  files.push({
    path: paths.headerPath,
    content: headerTsx(opts, profile, paths),
  });
  files.push({
    path: paths.footerPath,
    content: footerTsx(opts, profile),
  });
  files.push({
    path: paths.buttonPath,
    content: buttonTsx(profile, paths),
  });
  files.push({ path: paths.cnPath, content: cnTs() });

  if (paths.stripeLibPath) {
    files.push({ path: paths.stripeLibPath, content: stripeLibTs() });
  }
  if (paths.stripeRoutePath) {
    files.push({
      path: paths.stripeRoutePath,
      content: stripeCheckoutRouteTs(profile, paths),
    });
  }
  if (paths.hookPath) {
    files.push({ path: paths.hookPath, content: useExampleHookTs() });
  }
  if (paths.servicePath) {
    files.push({ path: paths.servicePath, content: apiServiceTs() });
  }

  return files;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function rootPackageJson(opts: GenerateOptions): string {
  const deps: Record<string, string> = {
    next: "^15.0.3",
    react: "^18.3.1",
    "react-dom": "^18.3.1",
  };
  if (opts.includeStripe) {
    deps.stripe = "^17.4.0";
    deps["@stripe/stripe-js"] = "^4.10.0";
  }
  const devDeps: Record<string, string> = {
    "@types/node": "^22.10.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    autoprefixer: "^10.4.20",
    eslint: "^9.16.0",
    "eslint-config-next": "^15.0.3",
    postcss: "^8.4.49",
    tailwindcss: "^3.4.15",
    typescript: "^5.7.2",
  };
  return (
    JSON.stringify(
      {
        name: slugify(opts.projectName),
        version: "0.1.0",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
          lint: "next lint",
        },
        dependencies: deps,
        devDependencies: devDeps,
      },
      null,
      2,
    ) + "\n"
  );
}

function tsconfig(profile: StyleProfile): string {
  // We only emit `paths` aliases when imports are absolute — otherwise
  // there's no need and it just adds noise.
  const compilerOptions: Record<string, unknown> = {
    target: "ES2022",
    lib: ["dom", "dom.iterable", "ES2022"],
    allowJs: false,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: "esnext",
    moduleResolution: "bundler",
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: "preserve",
    incremental: true,
    plugins: [{ name: "next" }],
  };
  if (profile.conventions.imports === "absolute") {
    const aliasTarget = profile.structure.useSrcDir ? "./src/*" : "./*";
    compilerOptions.paths = { "@/*": [aliasTarget] };
  }
  return (
    JSON.stringify(
      {
        compilerOptions,
        include: [
          "next-env.d.ts",
          "**/*.ts",
          "**/*.tsx",
          ".next/types/**/*.ts",
        ],
        exclude: ["node_modules"],
      },
      null,
      2,
    ) + "\n"
  );
}

function nextConfig(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;
}

function tailwindConfig(profile: StyleProfile): string {
  const root = profile.structure.useSrcDir ? "./src" : ".";
  // Always cover app/ + components/. Add hooks/services if the profile
  // includes them, since they may contain JSX (rare but possible).
  const dirs = ["app", "components"];
  if (profile.structure.hasHooksDir) dirs.push("hooks");
  if (profile.structure.hasServicesDir) dirs.push("services");
  const content = dirs.map((d) => `"${root}/${d}/**/*.{js,ts,jsx,tsx,mdx}"`);
  return `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    ${content.join(",\n    ")},
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

function postcssConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}

function nextEnvDts(): string {
  return `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`;
}

function globalsCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 250 250 250;
  --foreground: 23 23 23;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: 10 10 10;
    --foreground: 240 240 240;
  }
}

body {
  background: rgb(var(--background));
  color: rgb(var(--foreground));
  font-family: ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
`;
}

function layoutTsx(
  opts: GenerateOptions,
  profile: StyleProfile,
  paths: FrontendPaths,
): string {
  const desc = opts.description?.replace(/"/g, '\\"') ?? "";
  // globals.css is always imported by relative path — it's a CSS side-effect
  // import and Next.js convention is to use './globals.css' from layout.
  const cssRel = path.posix.relative(
    path.posix.dirname(paths.layoutPath),
    paths.globalsCssPath,
  );
  const cssImport = cssRel.startsWith(".") ? cssRel : "./" + cssRel;
  return `import type { Metadata } from "next";
import "${cssImport}";

export const metadata: Metadata = {
  title: ${JSON.stringify(opts.projectName)},
  description: ${JSON.stringify(desc)},
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
  // `profile` accepted for symmetry / future expansion (e.g. font choices).
  void profile;
}

function pageTsx(
  opts: GenerateOptions,
  profile: StyleProfile,
  paths: FrontendPaths,
): string {
  const tagline =
    opts.description ??
    `Welcome to ${opts.projectName}. Replace this hero section with your own copy.`;
  const headerImport = importStatement(
    "Header",
    paths.pagePath,
    paths.headerPath,
    profile,
  );
  const footerImport = importStatement(
    "Footer",
    paths.pagePath,
    paths.footerPath,
    profile,
  );
  // Button is always a named export (it's a UI primitive — named exports
  // are the more idiomatic choice for a `Button` shadcn-style component).
  const buttonImportPath = (() => {
    const noExt = paths.buttonPath.replace(/\.(tsx|ts|jsx|js)$/, "");
    if (profile.conventions.imports === "absolute") {
      const rootPrefix = profile.structure.useSrcDir ? "src/" : "";
      return `@/${noExt.replace(rootPrefix, "")}`;
    }
    const rel = path.posix.relative(
      path.posix.dirname(paths.pagePath),
      noExt,
    );
    return rel.startsWith(".") ? rel : "./" + rel;
  })();

  return `${headerImport}
${footerImport}
import { Button } from "${buttonImportPath}";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            ${escapeJsx(opts.projectName)}
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
            ${escapeJsx(tagline)}
          </p>
          <Button>Get started</Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
`;
}

function headerTsx(
  opts: GenerateOptions,
  profile: StyleProfile,
  paths: FrontendPaths,
): string {
  // next/link is a 3rd-party import — always written as `from "next/link"`.
  const exportPrefix = componentExportPrefix("Header", profile);
  void paths; // currently unused inside Header but kept in signature for symmetry
  return `import Link from "next/link";

${exportPrefix}() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">
          ${escapeJsx(opts.projectName)}
        </Link>
        <nav className="flex gap-6 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="#about" className="hover:text-foreground transition">About</Link>
          <Link href="#pricing" className="hover:text-foreground transition">Pricing</Link>
          <Link href="#contact" className="hover:text-foreground transition">Contact</Link>
        </nav>
      </div>
    </header>
  );
}
`;
}

function footerTsx(opts: GenerateOptions, profile: StyleProfile): string {
  const exportPrefix = componentExportPrefix("Footer", profile);
  return `${exportPrefix}() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 text-center text-sm text-zinc-500">
      &copy; {new Date().getFullYear()} ${escapeJsx(opts.projectName)}
    </footer>
  );
}
`;
}

function buttonTsx(profile: StyleProfile, paths: FrontendPaths): string {
  // Compute the cn import path relative to wherever Button ended up.
  const cnNoExt = paths.cnPath.replace(/\.ts$/, "");
  let cnImport: string;
  if (profile.conventions.imports === "absolute") {
    const rootPrefix = profile.structure.useSrcDir ? "src/" : "";
    cnImport = `@/${cnNoExt.replace(rootPrefix, "")}`;
  } else {
    const rel = path.posix.relative(
      path.posix.dirname(paths.buttonPath),
      cnNoExt,
    );
    cnImport = rel.startsWith(".") ? rel : "./" + rel;
  }
  return `import { cn } from "${cnImport}";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2",
        variant === "primary" &&
          "bg-zinc-900 text-white hover:bg-zinc-800 focus:ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
        variant === "secondary" &&
          "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white",
        className,
      )}
      {...props}
    />
  );
}
`;
}

function cnTs(): string {
  return `// Tiny className helper. Skip a runtime dep until you need clsx/twMerge.
export function cn(
  ...classes: Array<string | undefined | false | null>
): string {
  return classes.filter(Boolean).join(" ");
}
`;
}

function stripeLibTs(): string {
  return `import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Copy .env.example to .env.local and fill in your test keys.",
  );
}

// Pin the API version so behaviour doesn't drift when Stripe ships changes.
export const stripe = new Stripe(secret, { apiVersion: "2024-11-20.acacia" });
`;
}

function stripeCheckoutRouteTs(
  profile: StyleProfile,
  paths: FrontendPaths,
): string {
  const stripeNoExt = paths.stripeLibPath!.replace(/\.ts$/, "");
  let stripeImport: string;
  if (profile.conventions.imports === "absolute") {
    const rootPrefix = profile.structure.useSrcDir ? "src/" : "";
    stripeImport = `@/${stripeNoExt.replace(rootPrefix, "")}`;
  } else {
    const rel = path.posix.relative(
      path.posix.dirname(paths.stripeRoutePath!),
      stripeNoExt,
    );
    stripeImport = rel.startsWith(".") ? rel : "./" + rel;
  }
  return `import { NextResponse } from "next/server";
import { stripe } from "${stripeImport}";

// Force the Node runtime — Stripe's SDK uses APIs that aren't available
// on Edge.
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { priceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { priceId } = body;
  if (!priceId) {
    return NextResponse.json(
      { error: "priceId is required" },
      { status: 400 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: \`\${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}\`,
    cancel_url: \`\${siteUrl}/\`,
  });

  return NextResponse.json({ url: session.url });
}
`;
}

function useExampleHookTs(): string {
  return `import { useState } from "react";

/** Replace this with the first real custom hook in your app. The shape is
 * here so the project's hooks/ directory isn't empty on day one. */
export function useExample(initial = 0) {
  const [count, setCount] = useState(initial);
  return {
    count,
    increment: () => setCount((c) => c + 1),
    reset: () => setCount(initial),
  };
}
`;
}

function apiServiceTs(): string {
  return `// Tiny fetch wrapper. Replace as soon as you reach for axios/ky/etc.
//
// Keeps a single place to add auth headers, retries, error normalisation.

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(\`\${BASE_URL}\${path}\`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(\`GET \${path} failed: \${res.status}\`);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(\`\${BASE_URL}\${path}\`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(\`POST \${path} failed: \${res.status}\`);
  return (await res.json()) as T;
}
`;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "app"
  );
}

function escapeJsx(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}
