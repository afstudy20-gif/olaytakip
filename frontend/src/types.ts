export type ColKind = "numeric" | "categorical" | "text" | "date";

export interface ColMeta {
  name: string;
  dtype: string;
  kind: ColKind;
  original_name?: string | null;
}

export interface Session {
  session_id: string;
  filename: string;
  rows: number;
  columns: ColMeta[];
  preview: Record<string, unknown>[];
}

export interface SessionData {
  rows: number;
  columns: ColMeta[];
  preview: Record<string, unknown>[];
  undo_depth: number;
  redo_depth: number;
  trash_counts: { rows: number; columns: number };
}

export interface TrashItem {
  row_index?: number;
  name?: string;
  deleted_at: number;
}

export interface TrashData {
  rows: { row_index: number; data: Record<string, unknown>; deleted_at: number }[];
  columns: { name: string; deleted_at: number }[];
}

export type TabName = "data" | "summary" | "zreport" | "visuals" | "sessions";

export interface RecentSessionMeta {
  id: string;
  serverSessionId?: string;
  name: string;
  savedAt: number;
  sizeBytes: number;
  nRows?: number;
  nCols?: number;
  activeTab?: string;
  source: "auto" | "manual";
  deletedAt?: number | null;
}

export interface SummaryData {
  total_records: number;
  unique_people: number;
  repeated_people: number;
  cinsiyet: DistributionItem[];
  yas_grubu: DistributionItem[];
  il?: DistributionItem[];
  ilce?: DistributionItem[];
  mahalle?: DistributionItem[];
  konu?: DistributionItem[];
  aylik_gelis?: { ay: string; count: number }[];
  columns: ColumnSummary[];
}

export interface ColumnSummary {
  name: string;
  kind: 'numeric' | 'categorical' | 'date' | 'text';
  count: number;
  missing: number;
  unique: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
  std?: number;
  histogram?: HistogramBin[];
  distribution?: DistributionItem[];
  top_values?: DistributionItem[];
}

export interface HistogramBin {
  bin: string;
  count: number;
  range: [number, number];
}

export interface DistributionItem {
  value: string;
  count: number;
  percent: number;
}

export interface ZReportRow {
  period: string;
  total: number;
  unique_people: number;
  erkek: number;
  kadin: number;
  top_konu: string | null;
  top_konu_count: number;
  top_il: string | null;
  top_il_count: number;
  top_ilce: string | null;
  top_ilce_count: number;
  repeated_people: number;
  repeated_visits: number;
}

export interface ChartData {
  type: string;
  title: string;
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}

export interface ChartsData {
  cinsiyet: ChartData;
  yas_grubu: ChartData;
  aylik_trend: ChartData;
  cinsiyet_yas: ChartData;
  konu?: ChartData;
  konu_cinsiyet?: ChartData;
  konu_yas?: ChartData;
  aylik_konu?: ChartData;
  il?: ChartData;
  il_yas?: ChartData;
  ilce?: ChartData;
}
