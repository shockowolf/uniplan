import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PASSWORD_HASH_ALGORITHM = 'scrypt';
const PASSWORD_HASH_VERSION = 1;
const DEFAULT_COST = 32_768;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 1;
const DEFAULT_KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_BYTES = 1_024;
const MIN_COST = 16_384;
const MAX_COST = 65_536;
const MIN_BLOCK_SIZE = 8;
const MAX_BLOCK_SIZE = 16;
const MIN_PARALLELIZATION = 1;
const MAX_PARALLELIZATION = 2;
const MAX_SCRYPT_MEMORY_BYTES = 128 * 1024 * 1024;

type ScryptParameters = {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
};

type ParsedPasswordHash = ScryptParameters & {
  salt: Buffer;
  expectedKey: Buffer;
};

const defaultParameters: ScryptParameters = {
  cost: DEFAULT_COST,
  blockSize: DEFAULT_BLOCK_SIZE,
  parallelization: DEFAULT_PARALLELIZATION,
  keyLength: DEFAULT_KEY_LENGTH,
};

const dummySalt = Buffer.alloc(SALT_LENGTH);
const dummyExpectedKey = Buffer.alloc(DEFAULT_KEY_LENGTH);

function isPowerOfTwo(value: number) {
  return value > 1 && (value & (value - 1)) === 0;
}

function hasBoundedParameters(parameters: ScryptParameters) {
  const estimatedMemory = 128 * parameters.cost * parameters.blockSize;
  return (
    Number.isSafeInteger(parameters.cost) &&
    isPowerOfTwo(parameters.cost) &&
    parameters.cost >= MIN_COST &&
    parameters.cost <= MAX_COST &&
    Number.isSafeInteger(parameters.blockSize) &&
    parameters.blockSize >= MIN_BLOCK_SIZE &&
    parameters.blockSize <= MAX_BLOCK_SIZE &&
    Number.isSafeInteger(parameters.parallelization) &&
    parameters.parallelization >= MIN_PARALLELIZATION &&
    parameters.parallelization <= MAX_PARALLELIZATION &&
    parameters.keyLength >= 32 &&
    parameters.keyLength <= 64 &&
    estimatedMemory <= MAX_SCRYPT_MEMORY_BYTES
  );
}

function decodeCanonicalBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decodedValue = Buffer.from(value, 'base64url');
  return decodedValue.toString('base64url') === value ? decodedValue : null;
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash | null {
  const encodedParts = encodedHash.split('$');
  if (
    encodedParts.length !== 5 ||
    encodedParts[0] !== PASSWORD_HASH_ALGORITHM ||
    encodedParts[1] !== `v=${PASSWORD_HASH_VERSION}`
  ) {
    return null;
  }

  const parameterMatch = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(encodedParts[2]);
  if (!parameterMatch) return null;

  const salt = decodeCanonicalBase64Url(encodedParts[3]);
  const expectedKey = decodeCanonicalBase64Url(encodedParts[4]);
  if (!salt || salt.length < 16 || salt.length > 32 || !expectedKey) {
    return null;
  }

  const parameters = {
    cost: Number(parameterMatch[1]),
    blockSize: Number(parameterMatch[2]),
    parallelization: Number(parameterMatch[3]),
    keyLength: expectedKey.length,
  };
  if (!hasBoundedParameters(parameters)) return null;
  return { ...parameters, salt, expectedKey };
}

function deriveKey(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
) {
  const maxmem = Math.min(
    MAX_SCRYPT_MEMORY_BYTES + 1024 * 1024,
    128 * parameters.cost * parameters.blockSize + 1024 * 1024,
  );
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      parameters.keyLength,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export function validateNewPassword(password: string) {
  if (password.length < MIN_PASSWORD_CHARACTERS) {
    throw new Error(
      `Password must contain at least ${MIN_PASSWORD_CHARACTERS} characters.`,
    );
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error(`Password must not exceed ${MAX_PASSWORD_BYTES} bytes.`);
  }
}

export async function hashPassword(password: string) {
  validateNewPassword(password);
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt, defaultParameters);
  return [
    PASSWORD_HASH_ALGORITHM,
    `v=${PASSWORD_HASH_VERSION}`,
    `N=${defaultParameters.cost},r=${defaultParameters.blockSize},p=${defaultParameters.parallelization}`,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string) {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return false;

  const parsedHash = parsePasswordHash(encodedHash);
  const parameters = parsedHash ?? {
    ...defaultParameters,
    salt: dummySalt,
    expectedKey: dummyExpectedKey,
  };

  try {
    const derivedKey = await deriveKey(password, parameters.salt, parameters);
    return timingSafeEqual(derivedKey, parameters.expectedKey);
  } catch {
    return false;
  }
}
