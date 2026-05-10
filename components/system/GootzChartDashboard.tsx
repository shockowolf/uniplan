'use client';

import { useMemo, useState } from 'react';
import { ChartView } from '@/components/ChartView';
import { gootzChartGroups } from '@/lib/gootzCharts';

const periodOptions = ['3개월', '6개월', '1년', '3년'];

export function GootzChartDashboard() {
  const [activeGroupKey, setActiveGroupKey] = useState(gootzChartGroups[0]?.key ?? '');
  const [period, setPeriod] = useState(periodOptions[0]);

  const activeGroup = useMemo(
    () => gootzChartGroups.find((group) => group.key === activeGroupKey) ?? gootzChartGroups[0],
    [activeGroupKey]
  );

  return (
    <section className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">gootzERP Charts</p>
          <h1>홈 카드와 업무 통계 차트</h1>
        </div>
        <div className="status-pill">DevExpress Flow · Recharts Port</div>
      </header>

      <section className="chart-workbench">
        <div className="gootz-chart-toolbar">
          <div>
            <p className="eyebrow">Chart Source</p>
            <h2>{activeGroup.title}</h2>
            <span>{activeGroup.source}</span>
          </div>
          <div className="gootz-chart-controls">
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

        <div aria-label="차트 그룹" className="gootz-chart-tabs">
          {gootzChartGroups.map((group) => (
            <button aria-pressed={group.key === activeGroup.key} key={group.key} onClick={() => setActiveGroupKey(group.key)} type="button">
              {group.title}
            </button>
          ))}
        </div>

        <div className="gootz-chart-grid">
          {activeGroup.charts.map((chart) => (
            <ChartView chart={chart} key={chart.title} />
          ))}
        </div>
      </section>
    </section>
  );
}
