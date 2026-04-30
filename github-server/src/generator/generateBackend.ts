// Generates an optional NestJS backend in /backend.
//
// We keep this an independent npm project (not a workspace) so a beginner
// can run `cd backend && npm install` without learning monorepo tooling.
// Promote to workspaces when complexity warrants it.
//
// NestJS itself is opinionated about file naming (kebab-case `*.module.ts`,
// `*.service.ts`, etc.) and import style (always relative within a feature
// module), so the StyleProfile mostly doesn't change the backend output.
// We accept it for symmetry and so future profiles (e.g. "use Fastify
// adapter" or "include /api prefix") have a place to plug in.

import type {
  GeneratedFile,
  GenerateOptions,
} from "./generateProjectStructure.js";
import type { StyleProfile } from "./styleProfile.js";

export function generateBackendFiles(
  opts: GenerateOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _profile: StyleProfile,
): GeneratedFile[] {
  return [
    { path: "backend/package.json", content: backendPackageJson(opts) },
    { path: "backend/tsconfig.json", content: backendTsconfig() },
    { path: "backend/nest-cli.json", content: nestCliJson() },
    { path: "backend/.gitignore", content: backendGitignore() },
    { path: "backend/src/main.ts", content: mainTs() },
    { path: "backend/src/app.module.ts", content: appModuleTs() },
    { path: "backend/src/app.controller.ts", content: appControllerTs() },
    { path: "backend/src/app.service.ts", content: appServiceTs() },
    { path: "backend/README.md", content: backendReadme(opts) },
  ];
}

function backendPackageJson(opts: GenerateOptions): string {
  return (
    JSON.stringify(
      {
        name: `${slugify(opts.projectName)}-api`,
        version: "0.1.0",
        private: true,
        scripts: {
          build: "nest build",
          start: "nest start",
          "start:dev": "nest start --watch",
          "start:prod": "node dist/main.js",
        },
        dependencies: {
          "@nestjs/common": "^10.4.10",
          "@nestjs/core": "^10.4.10",
          "@nestjs/platform-express": "^10.4.10",
          "reflect-metadata": "^0.2.2",
          rxjs: "^7.8.1",
        },
        devDependencies: {
          "@nestjs/cli": "^10.4.8",
          "@nestjs/schematics": "^10.2.3",
          "@types/express": "^5.0.0",
          "@types/node": "^22.10.0",
          "ts-loader": "^9.5.1",
          "ts-node": "^10.9.2",
          "tsconfig-paths": "^4.2.0",
          typescript: "^5.7.2",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function backendTsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          module: "commonjs",
          target: "ES2022",
          outDir: "dist",
          declaration: true,
          removeComments: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          skipLibCheck: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          baseUrl: "./",
          incremental: true,
          sourceMap: true,
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist"],
      },
      null,
      2,
    ) + "\n"
  );
}

function nestCliJson(): string {
  return (
    JSON.stringify(
      {
        $schema: "https://json.schemastore.org/nest-cli",
        collection: "@nestjs/schematics",
        sourceRoot: "src",
      },
      null,
      2,
    ) + "\n"
  );
}

function backendGitignore(): string {
  return `# compiled output
/dist
/node_modules

# Logs
*.log

# OS / IDE
.DS_Store
.idea/
.vscode/

# Env
.env
.env*.local
`;
}

function mainTs(): string {
  return `import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.BACKEND_PORT) || 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(\`API listening on http://localhost:\${port}\`);
}

void bootstrap();
`;
}

function appModuleTs(): string {
  return `import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;
}

function appControllerTs(): string {
  return `import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("/health")
  getHealth() {
    return this.appService.getHealth();
  }
}
`;
}

function appServiceTs(): string {
  return `import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
`;
}

function backendReadme(opts: GenerateOptions): string {
  return `# ${opts.projectName} — API

NestJS backend for ${opts.projectName}. This is an independent npm project;
run it separately from the frontend.

## Run it

\`\`\`bash
cd backend
npm install
npm run start:dev    # http://localhost:3001
\`\`\`

## Endpoints

- \`GET /health\` — liveness probe.

Add new modules under \`src/\` and register them in \`app.module.ts\`.
`;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "app"
  );
}
