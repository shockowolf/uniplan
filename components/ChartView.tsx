'use client';

import type { Chart, ChartSeries } from '@/lib/templates/types';
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const chartPalette = ['#5fd3ff', '#62d98e', '#ffcf6b', '#ff8a7a', '#9f8cff', '#5ee1c6', '#f8a85d', '#a4c7ff'];

function numberLabel(value: unknown, format: Chart['valueFormat'], unit?: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value ?? '');
  if (unit === '%') return `${numericValue.toLocaleString('ko-KR')}%`;
  if (format === 'percent') return `${numericValue.toLocaleString('ko-KR')}%`;
  if (format === 'money') return `${Math.round(numericValue / 1000000).toLocaleString('ko-KR')}백만`;
  return numericValue.toLocaleString('ko-KR');
}

function tooltipLabel(value: unknown, name: unknown, chart: Chart) {
  const series = chart.series?.find((item) => item.name === name || item.key === name);
  return [numberLabel(value, chart.valueFormat, series?.unit), series?.name ?? name] as [string, string];
}

function resolveSeries(chart: Chart): ChartSeries[] {
  if (chart.series?.length) return chart.series;

  return [
    {
      key: chart.yKey,
      name: chart.yKey,
      type: chart.type === 'line' ? 'line' : 'bar'
    }
  ];
}

function renderSeries(chart: Chart, series: ChartSeries[]) {
  const chartKind = chart.kind ?? chart.type ?? 'bar';
  const stacked = chartKind === 'stacked-area' || chartKind === 'stacked-bar';

  return series.map((item, index) => {
    const color = item.color ?? chartPalette[index % chartPalette.length];
    const yAxisId = item.axis === 'right' ? 'right' : 'left';
    const itemType = item.type ?? (chartKind === 'line' ? 'line' : chartKind === 'stacked-area' ? 'area' : 'bar');

    if (itemType === 'line') {
      return <Line dataKey={item.key} dot={false} key={item.key} name={item.name} stroke={color} strokeWidth={3} type="monotone" yAxisId={yAxisId} />;
    }

    if (itemType === 'area') {
      return (
        <Area
          dataKey={item.key}
          fill={color}
          fillOpacity={0.32}
          key={item.key}
          name={item.name}
          stackId={stacked ? item.stackId ?? 'total' : item.stackId}
          stroke={color}
          strokeWidth={2}
          type="monotone"
          yAxisId={yAxisId}
        />
      );
    }

    return <Bar dataKey={item.key} fill={color} key={item.key} name={item.name} radius={[6, 6, 0, 0]} stackId={stacked ? item.stackId ?? 'total' : item.stackId} yAxisId={yAxisId} />;
  });
}

function ChartTreemap({ chart }: { chart: Chart }) {
  const total = chart.data.reduce((sum, item) => sum + Math.max(Number(item[chart.yKey]) || 0, 0), 0) || 1;

  return (
    <div className="chart-treemap">
      {chart.data.map((item, index) => {
        const value = Math.max(Number(item[chart.yKey]) || 0, 0);
        const basis = `${Math.max(18, (value / total) * 100)}%`;

        return (
          <div className="chart-treemap-node" key={`${item[chart.xKey]}-${index}`} style={{ '--node-color': chartPalette[index % chartPalette.length], flexBasis: basis, flexGrow: value } as React.CSSProperties}>
            <strong>{item[chart.xKey]}</strong>
            {'cateNm' in item ? <span>{item.cateNm}</span> : null}
            <em>{numberLabel(value, chart.valueFormat)}</em>
          </div>
        );
      })}
    </div>
  );
}

export function ChartView({ chart }: { chart?: Chart }) {
  if (!chart?.data?.length) return null;

  const series = resolveSeries(chart);
  const hasRightAxis = series.some((item) => item.axis === 'right');

  return (
    <section className="chart-card">
      <h2>{chart.title}</h2>
      {chart.description ? <p>{chart.description}</p> : null}
      <div className="chart-area">
        {chart.kind === 'treemap' ? (
          <ChartTreemap chart={chart} />
        ) : (
          <ResponsiveContainer height={chart.height ?? 300} width="100%">
            <ComposedChart data={chart.data} margin={{ top: 10, right: hasRightAxis ? 12 : 6, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#283650" />
              <XAxis dataKey={chart.xKey} stroke="#8da0bd" tick={{ fontSize: 12 }} />
              <YAxis stroke="#8da0bd" tick={{ fontSize: 12 }} tickFormatter={(value) => numberLabel(value, chart.valueFormat)} yAxisId="left" />
              {hasRightAxis ? <YAxis orientation="right" stroke="#8da0bd" tick={{ fontSize: 12 }} tickFormatter={(value) => numberLabel(value, 'percent')} yAxisId="right" /> : null}
              <Tooltip contentStyle={{ background: '#101b2d', border: '1px solid #2a3a56', borderRadius: 12 }} formatter={(value, name) => tooltipLabel(value, name, chart)} />
              <Legend wrapperStyle={{ color: '#93a6c3', fontSize: 12 }} />
              {renderSeries(chart, series)}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
