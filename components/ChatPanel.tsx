'use client';

import { FormEvent, useState } from 'react';
import { ChartView } from './ChartView';
import { DataGrid } from './DataGrid';
import { MetricCards } from './MetricCards';

type ChatResult = {
  templateId: string;
  message: string;
  metrics?: { label: string; value: string | number }[];
  chart?: {
    type: 'bar' | 'line';
    title: string;
    xKey: string;
    yKey: string;
    data: Record<string, string | number>[];
  };
  grid?: { columns: string[]; rows: Record<string, string | number>[] };
  suggestions: string[];
};

const examples = [
  { label: '매출 요약', text: '이번 달 매출 어때?' },
  { label: '지난달 비교', text: '지난달 매출 보여줘' },
  { label: '30일 매출', text: '최근 30일 매출' },
  { label: '미수금', text: '미수금 많은 거래처 TOP 10' },
  { label: '거래처 미수', text: '구리정밀 미수금 보여줘' },
  { label: '재고 위험', text: '재고 부족한 품목' },
  { label: '상품 재고', text: 'QR 주문 태블릿 재고 보여줘' },
  { label: '전체 현황', text: '오늘 사업 현황 요약' }
];

const menuItems = ['Dashboard', 'Sales', 'Customers', 'Inventory', 'Finance', 'Operations'];

export function ChatPanel({ initialResult }: { initialResult: ChatResult }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ChatResult>(initialResult);
  const [loading, setLoading] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('오늘 사업 현황 요약');

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
    <main className="dashboard-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <div className="brand-mark">U</div>
          <div>
            <div className="brand">UniPlan</div>
            <p>AI ERP</p>
          </div>
        </div>

        <nav className="nav-menu">
          {menuItems.map((item) => (
            <button className={item === 'Dashboard' ? 'active' : ''} key={item} type="button">
              {item}
            </button>
          ))}
        </nav>

        <section className="scenario-box">
          <p className="eyebrow">Demo Questions</p>
          {examples.map((example) => (
            <button key={example.text} onClick={() => ask(example.text)} type="button">
              <span>{example.label}</span>
              {example.text}
            </button>
          ))}
        </section>
      </aside>

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
    </main>
  );
}
