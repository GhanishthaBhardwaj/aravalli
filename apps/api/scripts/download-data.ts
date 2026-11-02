// Downloads the two public datasets into data/raw/ (git-ignored) and records where each came from.
//
//   npm run data:download -w @aravalli/api
//
// data/sources.json is committed: it holds the source URL, the download date, the size and the SHA-256 of every file, so the
// import can be traced back to exactly the bytes it was built from. The raw files themselves are never committed.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const rawDir = join(root, 'data', 'raw');
const manifestPath = join(root, 'data', 'sources.json');

interface Source {
  id: string;
  title: string;
  url: string;
  landingPage: string;
  licence: string;
  licenceUrl: string;
  file: string;
}

const SOURCES: Source[] = [
  {
    id: 'uci-incident-log',
    title: 'Incident management process enriched event log (ServiceNow)',
    url: 'https://archive.ics.uci.edu/static/public/498/incident+management+process+enriched+event+log.zip',
    landingPage: 'https://archive.ics.uci.edu/dataset/498/incident+management+process+enriched+event+log',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    file: 'uci-incident-log.zip',
  },
  {
    id: 'osha-severe-injury',
    title: 'OSHA Severe Injury Reports, January 2015 to November 2025',
    url: 'https://www.osha.gov/sites/default/files/January2015toNovember2025.zip',
    landingPage: 'https://www.osha.gov/severe-injury-reports',
    licence: 'US Government public data (see licenceUrl)',
    licenceUrl: 'https://www.osha.gov/severeinjury',
    file: 'osha-severe-injury.zip',
  },
];

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());
}

async function main(): Promise<void> {
  mkdirSync(rawDir, { recursive: true });
  const previous = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { sources: Record<string, unknown>[] })
    : { sources: [] };
  const force = process.argv.includes('--force');
  const records: Record<string, unknown>[] = [];

  for (const source of SOURCES) {
    const zipPath = join(rawDir, source.file);
    const extractDir = join(rawDir, source.id);
    if (!existsSync(zipPath) || force) {
      console.log(`downloading ${source.url}`);
      const response = await fetch(source.url, { redirect: 'follow' });
      if (!response.ok) {
        // Some sites refuse scripted downloads. The script does not try to get round that: save the file by hand instead.
        console.warn(`  skipped: ${source.url} answered ${response.status}.`);
        console.warn(`  Download it in a browser from ${source.landingPage} and save it as data/raw/${source.file}, then run this again.`);
        continue;
      }
      writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    } else {
      console.log(`already downloaded: ${source.file} (use --force to fetch again)`);
    }
    mkdirSync(extractDir, { recursive: true });
    if (process.platform === 'win32') {
      execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:ZIP_PATH -DestinationPath $env:ZIP_DEST -Force'], {
        stdio: 'inherit',
        env: { ...process.env, ZIP_PATH: zipPath, ZIP_DEST: extractDir },
      });
    } else {
      execFileSync('unzip', ['-o', '-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
    }

    const old = previous.sources.find((s) => s.id === source.id) as { downloadedOn?: string; sha256?: string } | undefined;
    const digest = sha256(zipPath);
    records.push({
      ...source,
      downloadedOn: old && old.sha256 === digest && old.downloadedOn ? old.downloadedOn : new Date().toISOString().slice(0, 10),
      bytes: statSync(zipPath).size,
      sha256: digest,
      extractedFiles: listFiles(extractDir),
    });
    console.log(`  ${source.id}: ${statSync(zipPath).size} bytes, sha256 ${digest}`);
  }

  writeFileSync(manifestPath, JSON.stringify({ sources: records }, null, 2) + '\n');
  console.log(`wrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error('If a download fails, fetch the file in a browser and save it under data/raw/ using the name in SOURCES.');
  process.exit(1);
});
