/**
 * ESM resolve hook for Node tests: lets Node import Vite-style extensionless
 * relative specifiers (e.g. `import x from "../api/client"`) by retrying with
 * `.js`/`.jsx` appended. Registered by test probes via `module.register`.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) {
      for (const ext of [".js", ".jsx"]) {
        try {
          const url = new URL(specifier + ext, context.parentURL);
          if (existsSync(fileURLToPath(url))) {
            return { url: url.href, shortCircuit: true };
          }
        } catch {
          // fall through to next extension / rethrow
        }
      }
    }
    throw err;
  }
}
