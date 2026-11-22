/// <reference types="vite/client" />
import manifest from "material-icon-theme/dist/material-icons.json";
import type { FileTreeIconConfig } from "@pierre/trees";

const sources = import.meta.glob<string>([
  "/node_modules/material-icon-theme/icons/*.svg",
  "!/node_modules/material-icon-theme/icons/folder*.svg",
], { query: "?raw", import: "default" });
const fileNames: Record<string, string> = manifest.fileNames;
const extensions: Record<string, string> = manifest.fileExtensions;
const definitions: Record<string, { iconPath: string }> = manifest.iconDefinitions;

export async function materialIcons(paths: readonly string[]): Promise<FileTreeIconConfig> {
  const byFileName: Record<string, string> = Object.create(null);
  const names = new Set<string>([manifest.file]);
  for (const path of paths) {
    const name = path.split("/").at(-1)!.toLowerCase();
    const parts = name.split(".");
    const extension = parts.slice(1).map((_, index) => parts.slice(index + 1).join(".")).find(value => extensions[value]);
    const icon = fileNames[name] || (extension && extensions[extension]) || manifest.file;
    byFileName[name] = `material-${icon}`;
    names.add(icon);
  }
  const symbols = await Promise.all([...names].map(async name => {
    const file = definitions[name].iconPath.split("/").at(-1);
    const svg = await sources[`/node_modules/material-icon-theme/icons/${file}`]();
    // Image context preserves each upstream SVG's viewBox and isolates internal IDs.
    return `<symbol id="material-${name}" viewBox="0 0 16 16"><image width="16" height="16" href="data:image/svg+xml,${encodeURIComponent(svg)}" /></symbol>`;
  }));
  return { set: "none", byFileName, remap: { "file-tree-icon-file": `material-${manifest.file}` }, spriteSheet: `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>` };
}
