import { resolve } from 'node:path';

export type CliOptions = { help: boolean; cwd: string; session?: string; block?: string; split: 'right' | 'left' | 'above' | 'below' };

export function parseCliArgs(argv: string[], currentDirectory: string): CliOptions {
  const options: CliOptions = { help: false, cwd: currentDirectory, split: 'right' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--split' || arg.startsWith('--split=')) {
      const value = arg === '--split' ? argv[++i] : arg.slice('--split='.length);
      if (!value || value.startsWith('--')) throw new Error('--split requires a value');
      if (!['right', 'left', 'above', 'below'].includes(value)) throw new Error('--split must be right, left, above, or below');
      options.split = value as CliOptions['split'];
    } else if (arg === '--cwd' || arg === '--session' || arg === '--block') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--cwd') {
        const url = value.startsWith('file://') ? new URL(value) : undefined;
        const path = url ? decodeURIComponent(url.pathname) : value;
        options.cwd = resolve(path);
      } else if (arg === '--session') options.session = value;
      else options.block = value;
    } else throw new Error(`Unknown option: ${arg}. Run rex-pierre-diffs --help.`);
  }
  return options;
}
