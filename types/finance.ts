export type TransactionType = 'ingreso' | 'gasto';
export type CategoryType    = 'ingreso' | 'gasto' | 'ambos';
export type BudgetStatus    = 'ok' | 'advertencia' | 'excedido' | 'sin_gastos' | 'sin_presupuesto';

export interface Category {
  id:         string;
  name:       string;
  type:       CategoryType;
  icon:       string;
  color:      string;
  sort_order: number;
}

export interface Transaction {
  id:          string;
  date:        string;           // ISO date: "2026-05-07"
  description: string;
  category_id: string | null;
  type:        TransactionType;
  amount:      number;
  notes:       string | null;
  source?:     string | null;   // banco de origen si fue importada desde Gmail
  email_id?:   string | null;   // id del correo (dedupe de importación)
  categories?: Pick<Category, 'name' | 'icon' | 'color'>;
}

export interface Budget {
  id:          string;
  category_id: string;
  year:        number;
  month:       number;
  amount:      number;
  notes:       string | null;
}

export interface BudgetStatusRow {
  year:           number;
  month:          number;
  category_id:    string;
  category_name:  string;
  icon:           string;
  color:          string;
  budget_amount:  number;
  spent:          number;
  available:      number;
  pct_used:       number;
  status:         BudgetStatus;
}

export interface MonthlySummary {
  year:          number;
  month:         number;
  total_income:  number;
  total_expenses:number;
  balance:       number;
  savings_pct:   number;
}
