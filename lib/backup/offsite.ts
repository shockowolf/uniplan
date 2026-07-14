import { statSync } from 'node:fs';
import { basename } from 'node:path';
import { SafeError, runTool, sha256File } from './common';

const RCLONE_NAMED_REMOTE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}:(?:[^\u0000-\u001f\u007f]*)$/;

export function assertNamedRcloneRemote(destination: string | undefined): string {
  if (!destination || !RCLONE_NAMED_REMOTE_PATTERN.test(destination)) {
    throw new SafeError(
      'OFFSITE_REMOTE_REQUIRED',
      'Required offsite destination must use a configured rclone named remote.',
    );
  }
  return destination;
}

function remoteFile(destination: string, localPath: string): string {
  return `${destination.replace(/\/+$/, '')}/${basename(localPath)}`;
}

function verifyRemoteFile(
  rclone: string,
  localPath: string,
  destination: string,
  environment: NodeJS.ProcessEnv,
) {
  const remotePath = remoteFile(destination, localPath);
  let size: unknown;
  try {
    size = JSON.parse(
      runTool('rclone remote size verification', rclone, ['size', '--json', remotePath], {
        env: environment,
      }),
    );
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError('OFFSITE_VERIFY_FAILED', 'Offsite size verification failed.');
  }
  const expectedSize = statSync(localPath).size;
  if (
    !size ||
    typeof size !== 'object' ||
    (size as { count?: unknown }).count !== 1 ||
    (size as { bytes?: unknown }).bytes !== expectedSize
  ) {
    throw new SafeError('OFFSITE_VERIFY_FAILED', 'Offsite size verification failed.');
  }
  const checksumOutput = runTool(
    'rclone remote checksum verification',
    rclone,
    ['hashsum', 'SHA-256', remotePath],
    { env: environment },
  );
  const remoteChecksum = /^([a-fA-F0-9]{64})(?:\s|$)/.exec(checksumOutput)?.[1]?.toLowerCase();
  if (!remoteChecksum || remoteChecksum !== sha256File(localPath)) {
    throw new SafeError('OFFSITE_VERIFY_FAILED', 'Offsite checksum verification failed.');
  }
}

export function uploadAndVerifyPair(
  rclone: string,
  destination: string,
  artifactPath: string,
  manifestPath: string,
  environment: NodeJS.ProcessEnv,
) {
  if (!destination || /[\u0000-\u001f\u007f]/.test(destination)) {
    throw new SafeError('OFFSITE_CONFIG_MISSING', 'A valid rclone destination is required.');
  }
  const remoteArtifact = remoteFile(destination, artifactPath);
  const remoteManifest = remoteFile(destination, manifestPath);
  try {
    runTool('rclone artifact upload', rclone, ['copyto', artifactPath, remoteArtifact], {
      env: environment,
    });
    runTool('rclone manifest upload', rclone, ['copyto', manifestPath, remoteManifest], {
      env: environment,
    });
    verifyRemoteFile(rclone, artifactPath, destination, environment);
    verifyRemoteFile(rclone, manifestPath, destination, environment);
  } catch (error) {
    try {
      runTool('rclone remote artifact cleanup', rclone, ['deletefile', remoteArtifact], {
        env: environment,
      });
    } catch {
      // Cleanup is best-effort; the run remains failed closed.
    }
    try {
      runTool('rclone remote manifest cleanup', rclone, ['deletefile', remoteManifest], {
        env: environment,
      });
    } catch {
      // Cleanup is best-effort; the run remains failed closed.
    }
    if (error instanceof SafeError && error.code === 'OFFSITE_VERIFY_FAILED') throw error;
    throw new SafeError('OFFSITE_FAILED', 'Offsite copy or verification failed.');
  }
}
