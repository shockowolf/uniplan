import { answerQuestion } from '@/lib/ai/orchestrator';

export async function POST(request: Request) {
  const body = (await request.json()) as { message?: string };
  const message = body.message?.trim();

  if (!message) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  return Response.json(await answerQuestion(message));
}
