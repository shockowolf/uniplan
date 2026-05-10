export type Metric = { label: string; value: string | number };
export type Grid = { columns: string[]; rows: Record<string, string | number>[] };
export type Chart = {
  type: 'bar' | 'line';
  title: string;
  xKey: string;
  yKey: string;
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

export function money(value: number) {
  return `${Math.round(value / 10000).toLocaleString('ko-KR')}만원`;
}
