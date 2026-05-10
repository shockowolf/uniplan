import { answerQuestion } from '@/lib/ai/orchestrator';

export async function GET() {
  return Response.json(await answerQuestion('오늘 사업 현황 요약'));
}
