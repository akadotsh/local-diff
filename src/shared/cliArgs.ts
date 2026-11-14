import { resolve } from 'node:path';

export type CliOptions = { help: boolean; cwd: string; session?: string; block?: string };

export function parseCliArgs(argv: string[], currentDirectory: string): CliOptions {
  const options: CliOptions = { help: false, cwd: currentDirectory };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--cwd' || arg === '--session' || arg === '--block') {
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
