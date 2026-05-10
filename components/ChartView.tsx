'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Chart = {
  type: 'bar' | 'line';
  title: string;
  xKey: string;
  yKey: string;
  data: Record<string, string | number>[];
};

export function ChartView({ chart }: { chart?: Chart }) {
  if (!chart?.data?.length) return null;

  return (
    <section className="chart-card">
      <h2>{chart.title}</h2>
      <div className="chart-area">
        <ResponsiveContainer width="100%" height={260}>
          {chart.type === 'line' ? (
            <LineChart data={chart.data} margin={{ top: 10, right: 20, left: 6, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#283650" />
              <XAxis dataKey={chart.xKey} stroke="#8da0bd" />
              <YAxis stroke="#8da0bd" tickFormatter={(value) => `${Math.round(Number(value) / 10000)}만`} />
              <Tooltip formatter={(value) => Number(value).toLocaleString('ko-KR')} />
              <Line type="monotone" dataKey={chart.yKey} stroke="#64d2ff" strokeWidth={3} dot />
            </LineChart>
          ) : (
            <BarChart data={chart.data} margin={{ top: 10, right: 20, left: 6, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#283650" />
              <XAxis dataKey={chart.xKey} stroke="#8da0bd" />
              <YAxis stroke="#8da0bd" tickFormatter={(value) => `${Math.round(Number(value) / 10000)}만`} />
              <Tooltip formatter={(value) => Number(value).toLocaleString('ko-KR')} />
              <Bar dataKey={chart.yKey} fill="#64d2ff" radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
