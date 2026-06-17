import {
  formatBackendKeyEnv,
  generateBackendKeyMaterial,
} from '../services/ehr/backendKeygen.js';
import { pathToFileURL } from 'node:url';
import type { BackendSigningAlg } from '../services/ehr/backendServices.js';

interface KeygenOptions {
  kid?: string;
  alg?: BackendSigningAlg;
  envPrefix?: string;
  json: boolean;
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const material = generateBackendKeyMaterial(options);

  if (options.json) {
    console.info(JSON.stringify(material, null, 2));
    return;
  }

  console.info(formatBackendKeyEnv(material));
}

export function parseCliOptions(args: string[]): KeygenOptions {
  const values = new Map<string, string | boolean>();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.trim();
    if (key === 'json') {
      values.set(key, true);
      continue;
    }
    const value = inlineValue ?? args[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, value);
    if (inlineValue === undefined) i += 1;
  }

  const alg = stringValue(values.get('alg')) ?? 'RS384';
  if (!isBackendSigningAlg(alg)) {
    throw new Error(`Unsupported alg: ${alg}`);
  }

  return {
    kid: stringValue(values.get('kid')),
    alg,
    envPrefix: stringValue(values.get('env-prefix')),
    json: values.get('json') === true,
  };
}

function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isBackendSigningAlg(value: string): value is BackendSigningAlg {
  return value === 'RS384' || value === 'ES384' || value === 'RS256' || value === 'ES256';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(
      `[ehr-keygen] ${error instanceof Error && error.message.length > 0 ? error.message : 'Key generation failed'}`,
    );
    process.exitCode = 1;
  }
}
