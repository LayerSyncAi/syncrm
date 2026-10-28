// The app shares the website's data layer and types (../src/lib) and talks to
// the same Convex functions (../convex/_generated), so Metro has to see those
// two folders as well as this one.
//
// Anything they import by package name - react, convex/react - must come from
// this app's node_modules, never the website's: the two are on different
// React versions, and a second copy of React breaks every hook. Left to normal
// Node resolution, a file in ../src would find ../node_modules first.

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repoRoot, "src"), path.join(repoRoot, "convex")];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];

// `@/` is the website's src folder, as in its tsconfig. Resolved here rather
// than through Expo's tsconfig-paths support (turned off in app.json), because
// mobile/tsconfig.json also points `react` and `convex` at this app's type
// definitions, which are for the type checker only.
const SHARED_ALIAS = "@/";

const isPackageImport = (name) =>
  !name.startsWith(".") && !name.startsWith("/") && !name.startsWith(SHARED_ALIAS);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(SHARED_ALIAS)) {
    const target = path.join(repoRoot, "src", moduleName.slice(SHARED_ALIAS.length));
    return context.resolveRequest(context, target, platform);
  }
  const fromShared = !context.originModulePath.startsWith(projectRoot + path.sep);
  const ctx =
    fromShared && isPackageImport(moduleName)
      ? { ...context, originModulePath: path.join(projectRoot, "package.json") }
      : context;
  return context.resolveRequest(ctx, moduleName, platform);
};

module.exports = config;
