#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function usage() {
  console.log(`Usage: node scripts/validate-migrations.js [--env-file <path>]

Runs the migration list and dry-run release gates with an explicit env file.

Options:
  --env-file, --env  Env file to load. Defaults to .env.
  --help             Show this help text.

Examples:
  npm run release:migrations
  npm run release:migrations -- --env-file .env.production`);
}

function parseArgs(argv) {
  const args = { envFile: '.env' };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--env-file' || arg === '--env') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      args.envFile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--env-file=')) {
      args.envFile = arg.slice('--env-file='.length);
      continue;
    }
    if (arg.startsWith('--env=')) {
      args.envFile = arg.slice('--env='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const [lineIndex, rawLine] of content.split(/\r?\n/).entries()) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed;
    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid env line ${lineIndex + 1} in ${filePath}: missing KEY=value`);
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid env key "${key}" on line ${lineIndex + 1} in ${filePath}`);
    }

    env[key] = parseEnvValue(withoutExport.slice(separatorIndex + 1).trim());
  }

  return env;
}

function parseEnvValue(value) {
  if (!value) return '';

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    const unquoted = value.slice(1, -1);
    if (quote === "'") return unquoted;
    return unquoted
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  return value.replace(/\s+#.*$/, '').trimEnd();
}

function run(command, args, env) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status ?? 'unknown'}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envFile = path.resolve(repoRoot, args.envFile);
  if (!fs.existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);

  const parsed = parseEnvFile(envFile);
  const env = { ...process.env, ...parsed };
  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is required in ${envFile}`);
  }

  console.log(`Using env file: ${path.relative(repoRoot, envFile) || envFile}`);
  run('npm', ['run', 'db:migrate:list'], env);
  run('npm', ['run', 'db:migrate:dry-run'], env);
  console.log('\nMigration validation passed.');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
