export type Metric = { label: string; value: string | number };
export type Grid = { columns: string[]; rows: Record<string, string | number>[] };
export type ChartKind = 'bar' | 'line' | 'stacked-bar' | 'stacked-area' | 'composed' | 'treemap';
export type ChartSeries = {
  key: string;
  name: string;
  type?: 'bar' | 'line' | 'area';
  axis?: 'left' | 'right';
  color?: string;
  stackId?: string;
  unit?: string;
};
export type Chart = {
  type?: 'bar' | 'line';
  kind?: ChartKind;
  title: string;
  description?: string;
  xKey: string;
  yKey: string;
  series?: ChartSeries[];
  valueFormat?: 'money' | 'count' | 'percent';
  height?: number;
  data: Record<string, string | number>[];
};

export type ChatResult = {
  templateId: string;
  message: string;
  resultType: 'metric_cards' | 'grid' | 'mixed';
  metrics?: Metric[];
  chart?: Chart;
  grid?: Grid;
  suggestions: string[];
};

export type TemplateContext = {
  companyId: string;
  params?: Record<string, string | number | boolean | null>;
};

export type QueryTemplate = {
  id: string;
  title: string;
  examples: string[];
  keywords: string[];
  run: (context: TemplateContext) => Promise<ChatResult>;
};

export function money(value: { toString(): string } | number) {
  return `${Math.round(Number(value) / 10000).toLocaleString('ko-KR')}만원`;
}
