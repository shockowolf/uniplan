import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BackupManifest,
  fsyncDirectory,
  readManifest,
  sha256File,
} from './common';

type ValidPair = {
  manifest: BackupManifest;
  manifestPath: string;
  artifactPath: string;
};

function validPairs(directory: string): ValidPair[] {
  const pairs: ValidPair[] = [];
  for (const filename of readdirSync(directory)) {
    if (!filename.endsWith('.manifest.json')) continue;
    const manifestPath = join(directory, filename);
    try {
      const manifest = readManifest(manifestPath);
      const artifactPath = join(directory, manifest.artifact.filename);
      if (!existsSync(artifactPath)) continue;
      const info = statSync(artifactPath);
      if (
        !info.isFile() ||
        info.size !== manifest.artifact.sizeBytes ||
        sha256File(artifactPath) !== manifest.artifact.sha256
      ) {
        continue;
      }
      pairs.push({ manifest, manifestPath, artifactPath });
    } catch {
      // Unknown, malformed, or incomplete files are never retention candidates.
    }
  }
  return pairs.sort((left, right) => Date.parse(right.manifest.createdAt) - Date.parse(left.manifest.createdAt));
}

export function applyPairAwareRetention(directory: string, keep: number): number {
  const pairs = validPairs(directory);
  const keepCount = Math.max(1, keep);
  let removed = 0;
  for (const pair of pairs.slice(keepCount)) {
    // Remove the commit marker first so readers can never observe a manifest for
    // an artifact being retired.
    rmSync(pair.manifestPath, { force: true });
    fsyncDirectory(directory);
    rmSync(pair.artifactPath, { force: true });
    fsyncDirectory(directory);
    removed += 1;
  }
  return removed;
}
