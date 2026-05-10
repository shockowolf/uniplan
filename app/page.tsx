import { ChatPanel } from '@/components/ChatPanel';
import { answerQuestion } from '@/lib/ai/orchestrator';

type HomeProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const initialQuestion = params?.q || '오늘 사업 현황 요약';

  return <ChatPanel initialQuestion={initialQuestion} initialResult={await answerQuestion(initialQuestion)} />;
}
