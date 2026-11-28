import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { packageRoot, standaloneVersion } from './upgrade.js';

export function pixelCommand(url: string): [string, ...string[]] {
  const root = standaloneVersion === undefined ? packageRoot : dirname(process.execPath);
  const require = createRequire(join(root, 'package.json'));
  const cli = join(dirname(require.resolve('@zenbu-labs/pixel/package.json')), 'dist/bin.js');
  return [process.execPath, ...(standaloneVersion === undefined ? [cli] : ['--internal-pixel']), join(root, 'hosts/pixel/dist/main.js'), '--', url];
}

export function runPixelCLI() {
  const require = createRequire(join(dirname(process.execPath), 'package.json'));
  process.argv.splice(2, 1);
  require(join(dirname(require.resolve('@zenbu-labs/pixel/package.json')), 'dist/bin.js'));
}
