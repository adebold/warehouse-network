npm warn Unknown project config "workspace-concurrency". This will stop working in the next major version of npm.

node:internal/modules/run_main:129
    triggerUncaughtException(
    ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/adebold/Documents/GitHub/warehouse-network/apps/web/scripts/ai-quality-integration.ts' imported from /Users/adebold/Documents/GitHub/warehouse-network/apps/web/
    at finalizeResolution (node:internal/modules/esm/resolve:265:11)
    at moduleResolve (node:internal/modules/esm/resolve:933:10)
    at defaultResolve (node:internal/modules/esm/resolve:1169:11)
    at nextResolve (node:internal/modules/esm/hooks:866:28)
    at resolveBase (file:///Users/adebold/Documents/GitHub/warehouse-network/node_modules/tsx/dist/esm/index.mjs?1767029058690:2:3744)
    at async resolveDirectory (file:///Users/adebold/Documents/GitHub/warehouse-network/node_modules/tsx/dist/esm/index.mjs?1767029058690:2:4237)
    at async resolve (file:///Users/adebold/Documents/GitHub/warehouse-network/node_modules/tsx/dist/esm/index.mjs?1767029058690:2:5355)
    at async nextResolve (node:internal/modules/esm/hooks:866:22)
    at async Hooks.resolve (node:internal/modules/esm/hooks:304:24)
    at async handleMessage (node:internal/modules/esm/worker:196:18) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///Users/adebold/Documents/GitHub/warehouse-network/apps/web/scripts/ai-quality-integration.ts'
}

Node.js v20.17.0
