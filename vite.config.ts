import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const parsePort = (value: string | undefined, fallback: number) => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
};

const devServerPort = parsePort(process.env.ELECTRON_INTERNAL_PORT, 3210);
const apiServerPort = parsePort(process.env.ELECTRON_API_PORT, 3211);

const omitProductionDemoChunks = (): Plugin => ({
  name: "omit-production-demo-chunks",
  generateBundle(_options, bundle) {
    const demoFacades = [
      "/src/features/cly/fixtures/",
      "/src/features/cly/agent-sessions/demo-screen.tsx",
      "/src/features/cly/agent-sessions/demo-services.ts",
      "/src/features/cly/agent-sessions/fixtures.ts",
      "/src/features/cly/components/pr-impact-review/fixtures.ts",
    ];
    for (const [fileName, output] of Object.entries(bundle)) {
      if (
        output.type === "chunk" &&
        (demoFacades.some((path) => output.facadeModuleId?.includes(path)) ||
          output.moduleIds.some((id) =>
            demoFacades.some((path) => id.includes(path)),
          ))
      ) {
        delete bundle[fileName];
      }
    }
    for (const output of Object.values(bundle)) {
      if (
        output.type === "chunk" &&
        /fixture:\/\/|createFixtureRepository|fixture-selector/.test(
          output.code,
        )
      ) {
        throw new Error(
          `Production bundle still contains demo fixture code in ${output.fileName}.`,
        );
      }
    }
  },
});

export default defineConfig(({ command, mode }) => ({
  define: {
    __CLY_INCLUDE_DEMOS__: JSON.stringify(
      command !== "build" || mode !== "production",
    ),
  },
  plugins: [
    react(),
    ...(command === "build" && mode === "production"
      ? [omitProductionDemoChunks()]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: devServerPort,
    strictPort: true,
    headers: {
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiServerPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
