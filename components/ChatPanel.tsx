'use client';

import { FormEvent, useState } from 'react';
import type { Chart } from '@/lib/templates/types';
import { ChartView } from './ChartView';
import { DataGrid } from './DataGrid';
import { MetricCards } from './MetricCards';

type ChatResult = {
  templateId: string;
  message: string;
  metrics?: { label: string; value: string | number }[];
  chart?: Chart;
  grid?: { columns: string[]; rows: Record<string, string | number>[] };
  suggestions: string[];
};

export function ChatPanel({ initialQuestion, initialResult }: { initialQuestion: string; initialResult: ChatResult }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ChatResult>(initialResult);
  const [loading, setLoading] = useState(false);
  const [lastQuestion, setLastQuestion] = useState(initialQuestion);

  async function ask(message: string) {
    setLoading(true);
    setLastQuestion(message);
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    setResult((await response.json()) as ChatResult);
    setLoading(false);
    setInput('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (message) await ask(message);
  }

  return (
    <section className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">MVP Prototype</p>
          <h1>사업 현황을 말로 물어보는 AI ERP</h1>
        </div>
        <div className="status-pill">Read-only · Template Safe</div>
      </header>

      <MetricCards metrics={result.metrics} />

      <section className="content-grid">
        <section className="insight-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">AI Insight</p>
              <h2>{loading ? '분석 중...' : result.templateId}</h2>
            </div>
            <span>{lastQuestion}</span>
          </div>
          <p className="answer-text">{loading ? '데이터를 조회하고 요약하는 중입니다.' : result.message}</p>
          <ChartView chart={result.chart} />
          <DataGrid grid={result.grid} />
        </section>

        <aside className="ai-panel">
          <p className="eyebrow">Ask UniPlan</p>
          <h2>AI 분석 명령실</h2>
          <p className="ai-copy">매출, 미수금, 재고, 상담/AS 현황을 안전한 템플릿으로 조회합니다.</p>

          <form className="chat-input" onSubmit={onSubmit}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="예: 이번 달 매출 어때?" />
            <button disabled={loading} type="submit">질문하기</button>
          </form>

          <div className="suggestions compact">
            {result.suggestions.map((suggestion) => (
              <button key={suggestion} onClick={() => ask(suggestion)} type="button">
                {suggestion}
              </button>
            ))}
          </div>
        </aside>
      </section>
    </section>
  );
}
