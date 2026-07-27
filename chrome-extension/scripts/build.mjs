import * as esbuild from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

mkdirSync(dist, { recursive: true });
copyFileSync(join(root, "src", "content.css"), join(dist, "content.css"));

const buildOptions = {
  entryPoints: {
    background: join(root, "src", "background.ts"),
    content: join(root, "src", "content.ts"),
    "admin-bridge": join(root, "src", "admin-bridge.ts"),
    options: join(root, "src", "options.ts"),
    popup: join(root, "src", "popup.ts"),
  },
  bundle: true,
  outdir: dist,
  entryNames: "[name]",
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  console.log("Watching chrome-extension sources...");
} else {
  await esbuild.build(buildOptions);
  console.log("Built chrome-extension to dist/");
}
