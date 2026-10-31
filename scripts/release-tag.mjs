import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
}

function checkedVersion() {
  const manifest = readJson('package.json');
  const lock = readJson('package-lock.json');
  const version = manifest.version;

  if (typeof version !== 'string' || !stableVersion.test(version)) {
    throw new Error('package.json version must be a stable MAJOR.MINOR.PATCH value');
  }
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    throw new Error('package.json and package-lock.json versions must match');
  }

  return version;
}

function runGit(args) {
  execFileSync('git', args, { stdio: 'inherit' });
}

function tagExists(ref) {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', ref], { stdio: 'ignore' });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw new Error(`cannot inspect ${ref}: ${error.message}`);
  }
}

function main(args) {
  const checkOnly = args.length === 1 && args[0] === '--check';
  if (args.length > 0 && !checkOnly) {
    throw new Error(`unknown argument: ${args[0]}`);
  }

  const version = checkedVersion();
  if (checkOnly) {
    console.log(`Version ${version} is consistent.`);
    return;
  }

  const tag = `v${version}`;
  const ref = `refs/tags/${tag}`;
  if (tagExists(ref)) {
    console.log(`${tag} already exists; leaving it unchanged.`);
    return;
  }

  runGit(['config', '--local', 'user.name', 'github-actions[bot]']);
  runGit(['config', '--local', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  runGit(['tag', '--annotate', tag, '--message', tag]);
  runGit(['push', 'origin', `${ref}:${ref}`]);
  console.log(`Created and pushed ${tag}.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`release-tag: ${error.message}`);
  process.exitCode = 1;
}
