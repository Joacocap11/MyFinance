export type Currency = "UYU" | "USD";
export type MovementKind = "expense" | "income" | "transfer";
export type CategoryKind = Exclude<MovementKind, "transfer">;

export interface Account {
  id: number;
  name: string;
  currency: Currency;
  opening_balance: string;
  current_balance: string;
  is_active: boolean;
}

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  parent_id: number | null;
  is_active: boolean;
}

export interface Movement {
  id: number;
  date: string;
  kind: MovementKind;
  amount: string;
  description: string;
  notes: string | null;
  account_id: number;
  destination_account_id: number | null;
  category_id: number | null;
  is_voided: boolean;
  created_at: string;
}

export interface MovementInput {
  date: string;
  kind: MovementKind;
  amount: string;
  description: string;
  notes?: string | null;
  account_id: number;
  destination_account_id?: number | null;
  category_id?: number | null;
}

export interface MovementFilters {
  date_from?: string;
  date_to?: string;
  month?: string;
  currency?: Currency;
  kind?: MovementKind;
  category_id?: number;
  account_id?: number;
  min_amount?: string;
  max_amount?: string;
  search?: string;
  include_voided?: boolean;
  page?: number;
  page_size?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReportCategory {
  category_id: number | null;
  name: string;
  amount: string;
  percentage: string | number;
}

export interface ReportComparison {
  previous_month: string;
  previous_expenses: string;
  change_percentage: string | number | null;
}

export interface ReportInsight {
  type: string;
  title: string;
  detail: string;
  category_id?: number | null;
  transaction_ids: number[];
}

export interface MonthlyReport {
  month: string;
  currency: Currency;
  income: string;
  expenses: string;
  net: string;
  spent_percentage: string | number | null;
  budget: string | null;
  comparison: ReportComparison | null;
  categories: ReportCategory[];
  top_expenses: Movement[];
  recent_transactions: Movement[];
  insights: ReportInsight[];
}

export interface HistoryMonth {
  month: string;
  income: string;
  expenses: string;
  net: string;
}

export interface HistoryReport {
  currency: Currency;
  months: HistoryMonth[];
}

export interface RecurringExpense {
  id: number;
  description: string;
  amount: string;
  day_of_month: number;
  account_id: number;
  category_id: number;
  is_active: boolean;
}

export interface CategoryRule {
  id: number;
  needle: string;
  category_id: number;
  priority: number;
  is_active: boolean;
}

export interface MonthlyBudget {
  currency: Currency;
  amount: string | null;
}

export type ImportState = "uploaded" | "previewed" | "confirmed";
export type ImportDisposition = "import" | "skip" | "possible_duplicate";

export interface ImportRow {
  id: number;
  row_number: number;
  date: string | null;
  description: string;
  amount: string | null;
  kind: MovementKind | null;
  category_id: number | null;
  disposition: ImportDisposition;
  possible_duplicate: boolean;
  error: string | null;
  raw?: Record<string, string>;
}

export interface ImportBatch {
  id: string;
  filename: string;
  state: ImportState;
  headers: string[];
  sample_rows: Record<string, string>[];
  rows?: ImportRow[];
}

export interface ImportMapping {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  kind?: string;
}

export interface ImportConfirmation {
  id: string;
  state: ImportState;
  imported_count: number;
  skipped_count: number;
  transaction_ids: number[];
}

export interface ApiErrorBody {
  detail?: string | Array<{ loc: Array<string | number>; msg: string }>;
}
