// Generates the Next.js (App Router) + Tailwind frontend file set.
//
// Files use stable, current versions and follow Next 15 / React 18 idioms.
// We deliberately keep the surface area small — a layout, a landing page,
// header, footer, a className helper. Just enough to be a real starting
// point without being noise.

import type {
  GeneratedFile,
  GenerateOptions,
} from "./generateProjectStructure.js";

export function generateFrontendFiles(
  opts: GenerateOptions,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({ path: "package.json", content: rootPackageJson(opts) });
  files.push({ path: "tsconfig.json", content: tsconfig() });
  files.push({ path: "next.config.mjs", content: nextConfig() });
  files.push({ path: "tailwind.config.ts", content: tailwindConfig() });
  files.push({ path: "postcss.config.mjs", content: postcssConfig() });
  files.push({ path: "next-env.d.ts", content: nextEnvDts() });

  files.push({ path: "app/globals.css", content: globalsCss() });
  files.push({ path: "app/layout.tsx", content: layoutTsx(opts) });
  files.push({ path: "app/page.tsx", content: pageTsx(opts) });

  files.push({ path: "components/Header.tsx", content: headerTsx(opts) });
  files.push({ path: "components/Footer.tsx", content: footerTsx(opts) });
  files.push({ path: "components/ui/Button.tsx", content: buttonTsx() });

  files.push({ path: "lib/cn.ts", content: cnTs() });

  if (opts.includeStripe) {
    files.push({ path: "lib/stripe.ts", content: stripeLibTs() });
    files.push({
      path: "app/api/stripe/checkout/route.ts",
      content: stripeCheckoutRouteTs(),
    });
  }

  return files;
}

// --- Templates --------------------------------------------------------------

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

function tsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
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
          paths: {
            "@/*": ["./*"],
          },
        },
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

function tailwindConfig(): string {
  return `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
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

function layoutTsx(opts: GenerateOptions): string {
  const desc = opts.description?.replace(/"/g, '\\"') ?? "";
  return `import type { Metadata } from "next";
import "./globals.css";

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
}

function pageTsx(opts: GenerateOptions): string {
  const tagline =
    opts.description ??
    `Welcome to ${opts.projectName}. Replace this hero section with your own copy.`;
  return `import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/Button";

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

function headerTsx(opts: GenerateOptions): string {
  return `import Link from "next/link";

export default function Header() {
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

function footerTsx(opts: GenerateOptions): string {
  return `export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 text-center text-sm text-zinc-500">
      &copy; {new Date().getFullYear()} ${escapeJsx(opts.projectName)}
    </footer>
  );
}
`;
}

function buttonTsx(): string {
  return `import { cn } from "@/lib/cn";
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

function stripeCheckoutRouteTs(): string {
  return `import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

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

// --- helpers ----------------------------------------------------------------

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "app"
  );
}

/** JSX text-content escaper. We embed user-provided strings into JSX, so we
 * defang the four characters that have meaning there. */
function escapeJsx(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}
