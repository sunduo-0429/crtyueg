
import { LoanInput, RepaymentRow, RepaymentEvent, RateChangeEvent } from '../types';

/**
 * 四舍五入保留两位小数
 */
function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * 等额本息标准月供计算公式 (PMT)
 */
export function calculatePMT(principal: number, monthlyRate: number, periods: number): number {
  if (periods <= 0 || principal <= 0) return 0;
  if (monthlyRate <= 0) return round2(principal / periods);
  const pmt = (monthlyRate * principal) / (1 - Math.pow(1 + monthlyRate, -periods));
  return round2(pmt);
}

/**
 * 规范化日期为 UTC
 */
function getUTCDate(dateStr: string | Date): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * 计算两日期间的天数
 */
function getDaysBetween(d1: string | Date, d2: string | Date): number {
  const t1 = getUTCDate(d1).getTime();
  const t2 = getUTCDate(d2).getTime();
  if (isNaN(t1) || isNaN(t2)) return 0;
  return Math.max(0, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)));
}

/**
 * 增加自然月
 */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * 精确利息计算逻辑：足月部分用月利率，不足月部分按天数算
 */
function calculateAccurateInterest(principal: number, annualRate: number, startDateStr: string, endDateStr: string): number {
  const start = getUTCDate(startDateStr);
  const end = getUTCDate(endDateStr);
  
  if (start.getTime() >= end.getTime()) return 0;

  let fullMonths = 0;
  let testDate = addMonths(start, 1);
  while (testDate.getTime() <= end.getTime()) {
    fullMonths++;
    testDate = addMonths(start, fullMonths + 1);
  }
  
  const afterFullMonthsDate = addMonths(start, fullMonths);
  const extraDays = getDaysBetween(afterFullMonthsDate, endDateStr);
  
  const monthlyRate = annualRate / 12;
  const dailyRate = annualRate / 360;
  
  return principal * (fullMonths * monthlyRate + extraDays * dailyRate);
}

/**
 * 生成还款计划
 */
export function generateSchedule(
  input: LoanInput,
  repayments: RepaymentEvent[] = [],
  rateChanges: RateChangeEvent[] = []
): RepaymentRow[] {
  if (!input.principal || input.principal <= 0) return [];

  const schedule: RepaymentRow[] = [];
  let currentBalance = input.principal;
  let currentAnnualRate = input.annualRate;
  let lastTransactionDateStr = input.loanDate;
  
  // 初始月供计算
  let currentPMT = calculatePMT(currentBalance, currentAnnualRate / 12, input.totalPeriods);

  const sortedRepayments = [...repayments].sort((a, b) => a.date.localeCompare(b.date));
  const sortedRateChanges = [...rateChanges].sort((a, b) => a.date.localeCompare(b.date));

  const firstPaymentDateObj = getUTCDate(input.firstPaymentDate);
  const paymentDay = firstPaymentDateObj.getUTCDate();
  const startYear = firstPaymentDateObj.getUTCFullYear();
  const startMonth = firstPaymentDateObj.getUTCMonth();

  for (let i = 1; i <= input.totalPeriods; i++) {
    if (currentBalance <= 0.005) break;

    // 确定本期计划还款日
    let scheduledDateStr = '';
    if (i === input.totalPeriods && input.maturityDate) {
      scheduledDateStr = input.maturityDate;
    } else {
      const d = new Date(Date.UTC(startYear, startMonth + (i - 1), paymentDay));
      if (d.getUTCDate() !== paymentDay) d.setUTCDate(0); 
      scheduledDateStr = d.toISOString().split('T')[0];
    }

    // 收集本期计划还款日前的所有事件
    const periodEvents = [
      ...sortedRateChanges.filter(rc => rc.date > lastTransactionDateStr && rc.date <= scheduledDateStr).map(c => ({ type: 'rate' as const, date: c.date, val: c.newAnnualRate })),
      ...sortedRepayments.filter(er => er.date > lastTransactionDateStr && er.date <= scheduledDateStr).map(p => ({ type: 'extra' as const, date: p.date, val: p.amount })),
      { type: 'scheduled' as const, date: scheduledDateStr, val: 0 }
    ].sort((a, b) => a.date.localeCompare(b.date));

    for (const event of periodEvents) {
      if (currentBalance <= 0.005) break;

      if (event.type === 'rate') {
        // 1. 利率变更不产生还款行，但触发后续重算
        currentAnnualRate = event.val;
        const remainingPeriods = input.totalPeriods - i + 1;
        currentPMT = calculatePMT(currentBalance, currentAnnualRate / 12, remainingPeriods);
        // lastTransactionDate 不变，因为没有实际还款
        continue;
      }

      let interest = 0;
      // 核心：提前还款和计划还款分别产生独立行
      // 利息计算从上一次任何交易日开始
      
      // 判断是否是标准的“中间整月” (无变动且上一次交易就是上个月的计划还款)
      const isStandardMonth = i > 1 && 
                              i < input.totalPeriods && 
                              periodEvents.length === 1 && 
                              getDaysBetween(lastTransactionDateStr, event.date) >= 28 && 
                              getDaysBetween(lastTransactionDateStr, event.date) <= 31;

      if (isStandardMonth && event.type === 'scheduled') {
        interest = round2(currentBalance * (currentAnnualRate / 12));
      } else {
        interest = round2(calculateAccurateInterest(currentBalance, currentAnnualRate, lastTransactionDateStr, event.date));
      }

      if (event.type === 'extra') {
        // 提前还款行：独立核算利息和冲抵本金
        const principalReduction = round2(event.val - interest);
        currentBalance = round2(currentBalance - principalReduction);

        schedule.push({
          period: i,
          date: event.date,
          payment: event.val,
          principal: principalReduction,
          interest: interest,
          remainingBalance: Math.max(0, currentBalance),
          isAdjusted: true,
          eventType: 'extra'
        });

        // 【关键】：提前还款后立即重算后续月供
        const remainingPeriods = input.totalPeriods - i + 1;
        currentPMT = calculatePMT(currentBalance, currentAnnualRate / 12, remainingPeriods);
      } 
      else if (event.type === 'scheduled') {
        // 计划还款行
        let principalPortion = 0;
        
        if (i === 1) {
          // 首期维持摊还节奏：本金 = 计划月供 - 标准月息
          const standardMonthlyInterest = currentBalance * (currentAnnualRate / 12);
          principalPortion = currentPMT - standardMonthlyInterest;
        } else if (i === input.totalPeriods || currentBalance < currentPMT) {
          principalPortion = currentBalance;
        } else {
          // 中间期本金 = 计划月供 - 本段实际利息
          principalPortion = currentPMT - interest;
        }

        let roundedPrinc = round2(principalPortion);
        if (currentBalance - roundedPrinc < 0.05) roundedPrinc = currentBalance;

        currentBalance = round2(currentBalance - roundedPrinc);
        
        schedule.push({
          period: i,
          date: event.date,
          payment: round2(roundedPrinc + interest),
          principal: roundedPrinc,
          interest: interest,
          remainingBalance: Math.max(0, currentBalance),
          isAdjusted: periodEvents.length > 1,
          eventType: 'scheduled'
        });
      }

      lastTransactionDateStr = event.date;
    }
  }

  return schedule;
}
