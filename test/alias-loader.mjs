import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const srcDir = path.join(rootDir, "src");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }

  if (specifier.startsWith("@/")) {
    const relativePath = specifier.slice(2);
    let target = path.join(srcDir, relativePath);

    if (!fs.existsSync(target)) {
      if (fs.existsSync(`${target}.js`)) {
        target = `${target}.js`;
      } else if (fs.existsSync(`${target}.mjs`)) {
        target = `${target}.mjs`;
      } else if (fs.existsSync(path.join(target, "index.js"))) {
        target = path.join(target, "index.js");
      }
    }

    return nextResolve(pathToFileURL(target).href, context);
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parentURL = context.parentURL;
    if (parentURL && parentURL.startsWith("file://")) {
      const parentDir = path.dirname(fileURLToPath(parentURL));
      const target = path.resolve(parentDir, specifier);
      if (!fs.existsSync(target)) {
        if (fs.existsSync(`${target}.js`)) {
          return nextResolve(pathToFileURL(`${target}.js`).href, context);
        } else if (fs.existsSync(`${target}.mjs`)) {
          return nextResolve(pathToFileURL(`${target}.mjs`).href, context);
        } else if (fs.existsSync(path.join(target, "index.js"))) {
          return nextResolve(pathToFileURL(path.join(target, "index.js")).href, context);
        }
      }
    }
  }

  return nextResolve(specifier, context);
}
