import { stdin, stdout } from 'node:process';
import { setInvitedUserPassword } from '@/lib/auth/login';
import { prisma } from '@/lib/db';

type CommandArguments = {
  companyCode: string;
  email: string;
};

function readNamedArgument(argumentName: string) {
  const argumentIndex = process.argv.indexOf(argumentName);
  const argumentValue = process.argv[argumentIndex + 1];
  return argumentIndex >= 0 && argumentValue && !argumentValue.startsWith('--')
    ? argumentValue.trim()
    : '';
}

function parseCommandArguments(): CommandArguments {
  const companyCode = readNamedArgument('--company');
  const email = readNamedArgument('--email');
  if (!companyCode || !email) {
    throw new Error(
      'Usage: npm run auth:set-password -- --company COMPANY_CODE --email USER_EMAIL',
    );
  }
  return { companyCode, email };
}

function readHiddenLine(prompt: string) {
  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
    throw new Error('Password entry requires an interactive terminal.');
  }

  return new Promise<string>((resolve, reject) => {
    let enteredValue = '';
    const wasRaw = stdin.isRaw;
    stdout.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();

    const finish = (error?: Error) => {
      stdin.removeListener('data', handleInput);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(enteredValue);
    };

    const handleInput = (input: string | Buffer) => {
      for (const character of input.toString()) {
        if (character === '\u0003') {
          finish(new Error('Password reset cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          enteredValue = Array.from(enteredValue).slice(0, -1).join('');
          continue;
        }
        if (character >= ' ') enteredValue += character;
      }
    };

    stdin.on('data', handleInput);
  });
}

async function main() {
  const commandArguments = parseCommandArguments();
  const password = await readHiddenLine('New password: ');
  const passwordConfirmation = await readHiddenLine('Confirm password: ');
  if (password !== passwordConfirmation) {
    throw new Error('Password confirmation does not match.');
  }

  await setInvitedUserPassword({ ...commandArguments, password });
  stdout.write(
    `Password reset completed for ${commandArguments.companyCode} / ${commandArguments.email}. Existing sessions were revoked.\n`,
  );
}

main()
  .catch((error: unknown) => {
    const safeMessage =
      error instanceof Error ? error.message : 'Password reset failed.';
    process.stderr.write(`${safeMessage}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
