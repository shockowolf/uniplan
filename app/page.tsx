import { ChatPanel } from '@/components/ChatPanel';
import { answerQuestion } from '@/lib/ai/orchestrator';

export default async function Home() {
  return <ChatPanel initialResult={await answerQuestion('오늘 사업 현황 요약')} />;
}
