// Lets node --test import src modules written with webpack-style resolution:
// the "@/..." alias (jsconfig paths) and extensionless relative imports.
export async function resolve(specifier, context, nextResolve) {
  const candidates = [];
  if (specifier.startsWith("@/")) {
    const base = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    candidates.push(base, `${base}.js`, `${base}.jsx`, `${base}/index.js`);
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.includes("/src/") &&
    !/\.(js|jsx|mjs|json)$/.test(specifier)
  ) {
    const base = new URL(specifier, context.parentURL).href;
    candidates.push(`${base}.js`, `${base}.jsx`, `${base}/index.js`);
  } else {
    return nextResolve(specifier, context);
  }
  for (const candidate of candidates) {
    try {
      return await nextResolve(candidate, context);
    } catch {
      // try the next variant
    }
  }
  return nextResolve(specifier, context); // surfaces the original resolution error
}
