// Lets node --test resolve the repo's "@/..." jsconfig alias so lib modules
// can be imported directly in functional tests.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const path = specifier.slice(2);
    const withExtension = /\.[a-z]+$/.test(path) ? path : `${path}.js`;
    return nextResolve(new URL(`../src/${withExtension}`, import.meta.url).href, context);
  }
  // Repo source uses extensionless relative imports (bundler resolution);
  // node needs the explicit extension.
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/.test(specifier)) {
    try {
      return await nextResolve(specifier, context);
    } catch {
      return nextResolve(`${specifier}.js`, context);
    }
  }
  return nextResolve(specifier, context);
}
