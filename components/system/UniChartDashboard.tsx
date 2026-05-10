'use client';

import { useMemo, useState } from 'react';
import { ChartView } from '@/components/ChartView';
import { uniChartGroups } from '@/lib/uniCharts';

const periodOptions = ['3개월', '6개월', '1년', '3년'];

export function UniChartDashboard() {
  const [activeGroupKey, setActiveGroupKey] = useState(uniChartGroups[0]?.key ?? '');
  const [period, setPeriod] = useState(periodOptions[0]);

  const activeGroup = useMemo(
    () => uniChartGroups.find((group) => group.key === activeGroupKey) ?? uniChartGroups[0],
    [activeGroupKey]
  );

  return (
    <section className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">Uni Charts</p>
          <h1>Uni 차트 라이브러리</h1>
        </div>
        <div className="status-pill">Uni Chart Library</div>
      </header>

      <section className="chart-workbench">
        <div className="uni-chart-toolbar">
          <div>
            <p className="eyebrow">Chart Set</p>
            <h2>{activeGroup.title}</h2>
            <span>{activeGroup.sourceLabel}</span>
          </div>
          <div className="uni-chart-controls">
            <label>
              기간
              <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                {periodOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div aria-label="차트 그룹" className="uni-chart-tabs">
          {uniChartGroups.map((group) => (
            <button aria-pressed={group.key === activeGroup.key} key={group.key} onClick={() => setActiveGroupKey(group.key)} type="button">
              {group.title}
            </button>
          ))}
        </div>

        <div className="uni-chart-grid">
          {activeGroup.charts.map((chart) => (
            <ChartView chart={chart} key={chart.title} />
          ))}
        </div>
      </section>
    </section>
  );
}
