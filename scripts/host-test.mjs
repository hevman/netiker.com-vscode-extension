import { runTests } from '@vscode/test-electron';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const root = fileURLToPath(new URL('../', import.meta.url));
delete process.env.ELECTRON_RUN_AS_NODE;
await build({ entryPoints: [join(root, 'test/host-smoke.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: join(root, 'dist/host-smoke.cjs') });
await runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: join(root, 'dist/host-smoke.cjs'),
  extensionTestsEnv: { NETIKER_SMOKE_RESULT: join(tmpdir(), 'netiker-vscode-smoke-result.json') },
  launchArgs: ['--disable-extensions', '--disable-gpu', '--skip-welcome', '--skip-release-notes', '--no-sandbox'],
});
