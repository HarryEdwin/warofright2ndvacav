import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const publicDir = resolve(root, "public");
const directories = ["assets", "css", "js", "pages"];

await mkdir(publicDir, { recursive: true });
await cp(resolve(root, "index.html"), resolve(publicDir, "index.html"));

for (const directory of directories) {
  const destination = resolve(publicDir, directory);
  await rm(destination, { recursive: true, force: true });
  await cp(resolve(root, directory), destination, { recursive: true });
}

const unusedDeploymentAssets = [
  "assets/pages",
  "assets/content/achievement-frame.png",
  "assets/content/sponsor-frame.png",
  "assets/content/laurel.png",
  "assets/content/sponsor-arch.png",
  "assets/content/bilibili.png",
];

for (const asset of unusedDeploymentAssets) {
  await rm(resolve(publicDir, asset), { recursive: true, force: true });
}
