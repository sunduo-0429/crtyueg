
export interface LoanInput {
  id: string;
  principal: number;
  annualRate: number; // e.g., 0.05 for 5%
  loanDate: string; // YYYY-MM-DD
  firstPaymentDate: string; // YYYY-MM-DD
  maturityDate: string; // YYYY-MM-DD
  totalPeriods: number;
}

export interface RepaymentEvent {
  date: string;
  amount: number;
}

export interface RateChangeEvent {
  date: string;
  newAnnualRate: number;
}

export interface RepaymentRow {
  period: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
  isAdjusted?: boolean;
  eventType?: 'scheduled' | 'extra';
}

export interface CalculationResult {
  loanId: string;
  schedule: RepaymentRow[];
  totalInterest: number;
  totalPayment: number;
}
