import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ChatPanel } from '@/components/ChatPanel';
import { answerQuestion } from '@/lib/ai/orchestrator';
import {
  isDemoAuthenticationEnabled,
  resolveDemoIdentity,
} from '@/lib/auth/permissions';
import {
  resolveSessionToken,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';

type HomeProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const initialQuestion = params?.q || '오늘 사업 현황 요약';
  const cookieStore = await cookies();
  const sessionCookies = cookieStore.getAll(SESSION_COOKIE_NAME);
  const sessionContext =
    sessionCookies.length === 1
      ? await resolveSessionToken(sessionCookies[0].value)
      : null;
  const localDemoIdentity =
    sessionCookies.length === 0 && isDemoAuthenticationEnabled()
      ? await resolveDemoIdentity()
      : null;
  if (!sessionContext && !localDemoIdentity) redirect('/login');
  const companyId = sessionContext?.companyId ?? localDemoIdentity!.companyId;

  return (
    <ChatPanel
      initialQuestion={initialQuestion}
      initialResult={await answerQuestion(initialQuestion, companyId)}
    />
  );
}
