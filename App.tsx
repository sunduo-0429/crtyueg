
import React, { useState, useMemo } from 'react';
import { LoanInput, RepaymentEvent, RateChangeEvent } from './types';
import { generateSchedule } from './services/loanCalculator';
import { analyzeSchedule } from './services/geminiService';
import { Button } from './components/Button';
import { LoanChart } from './components/LoanChart';

const App: React.FC = () => {
  const [loanInputs, setLoanInputs] = useState<LoanInput[]>([]);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [extraRepayments, setExtraRepayments] = useState<RepaymentEvent[]>([]);
  const [rateChanges, setRateChanges] = useState<RateChangeEvent[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [showPythonCode, setShowPythonCode] = useState(false);

  const currentLoan = useMemo(() => 
    loanInputs.find(l => l.id === selectedLoanId), 
    [loanInputs, selectedLoanId]
  );

  const schedule = useMemo(() => {
    if (!currentLoan) return [];
    return generateSchedule(currentLoan, extraRepayments, rateChanges);
  }, [currentLoan, extraRepayments, rateChanges]);

  const stats = useMemo(() => {
    if (schedule.length === 0) return { totalInterest: 0, totalPayment: 0 };
    const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0);
    const totalPayment = schedule.reduce((sum, r) => sum + r.payment, 0);
    return { totalInterest, totalPayment };
  }, [schedule]);

  const exportSchedule = () => {
    if (!schedule.length) return;
    
    let content = "还款计划书 (Repayment Schedule)\n";
    content += "生成日期: " + new Date().toLocaleDateString() + "\n";
    content += "========================================================\n";
    if (currentLoan) {
      content += `贷款本金: ¥${currentLoan.principal.toLocaleString()}\n`;
      content += `初始年化利率: ${(currentLoan.annualRate * 100).toFixed(2)}%\n`;
      content += `放款日期: ${currentLoan.loanDate}\n`;
      content += `首次还款日: ${currentLoan.firstPaymentDate}\n`;
      content += `贷款期数: ${currentLoan.totalPeriods}期\n`;
    }
    content += "========================================================\n";
    content += "期数 | 还款日期 | 类型 | 本期合计还款 | 偿还本金 | 偿还利息 | 剩余本金\n";
    content += "----------------------------------------------------------------------\n";
    
    schedule.forEach(r => {
      const typeLabel = r.eventType === 'extra' ? "提前" : "计划";
      content += `${r.period.toString().padEnd(4)} | ${r.date} | ${typeLabel} | ${r.payment.toFixed(2).padStart(12)} | ${r.principal.toFixed(2).padStart(10)} | ${r.interest.toFixed(2).padStart(10)} | ${r.remainingBalance.toFixed(2).padStart(12)}\n`;
    });

    content += "----------------------------------------------------------------------\n";
    content += `总计利息支出: ¥${stats.totalInterest.toFixed(2)}\n`;
    content += `总计还款总额: ¥${stats.totalPayment.toFixed(2)}\n`;
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Repayment_Plan_${selectedLoanId || 'Latest'}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (type: 'loan' | 'repayment' | 'rate') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string).replace(/^\uFEFF/, '').trim();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      if (type === 'loan') {
        const newLoans: LoanInput[] = lines.map((line, idx) => {
          const parts = line.split(/[,，\t]/).map(p => p.trim());
          if (parts.length < 6) return null;
          return {
            id: `L-${idx + 1}-${Date.now().toString().slice(-4)}`,
            principal: parseFloat(parts[0]),
            annualRate: parseFloat(parts[1]) / 100,
            loanDate: parts[2],
            firstPaymentDate: parts[3],
            maturityDate: parts[4],
            totalPeriods: parseInt(parts[5]),
          };
        }).filter((l): l is LoanInput => l !== null && !isNaN(l.principal));
        
        if (newLoans.length > 0) {
          setLoanInputs(newLoans);
          setSelectedLoanId(newLoans[0].id);
        }
      } else if (type === 'repayment') {
        const events: RepaymentEvent[] = lines.map(line => {
          const parts = line.split(/[,，\t]/).map(p => p.trim());
          return { date: parts[0], amount: parseFloat(parts[1]) || 0 };
        }).filter(e => e.amount > 0);
        setExtraRepayments(prev => [...prev, ...events].sort((a,b) => a.date.localeCompare(b.date)));
      } else if (type === 'rate') {
        const changes: RateChangeEvent[] = lines.map(line => {
          const parts = line.split(/[,，\t]/).map(p => p.trim());
          return { date: parts[0], newAnnualRate: parseFloat(parts[1]) / 100 || 0 };
        }).filter(c => c.newAnnualRate > 0);
        setRateChanges(prev => [...prev, ...changes].sort((a,b) => a.date.localeCompare(b.date)));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAiAnalyze = async () => {
    if (!schedule.length) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeSchedule(schedule, userQuery || "请分析此次调息和提前还款后，对我的贷款总支出产生了什么影响？");
      setAiAnalysis(result || "分析暂无结果。");
    } catch (error) {
      setAiAnalysis("分析服务暂不可用。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-indigo-900 flex items-center gap-2">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              智能还款计划 Pro
            </h1>
            <p className="text-slate-500 mt-1">等额本息 · 动态调息 · 精确核算 · Python 兼容</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowPythonCode(!showPythonCode)}>
              {showPythonCode ? '返回计算器' : '查看 Python 脚本'}
            </Button>
            <label className="cursor-pointer">
              <span className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors inline-block shadow-sm">
                上传放款文件
              </span>
              <input type="file" className="hidden" accept=".csv,.txt" onChange={handleFileUpload('loan')} />
            </label>
            {schedule.length > 0 && !showPythonCode && (
              <Button variant="secondary" onClick={exportSchedule}>导出计划书</Button>
            )}
          </div>
        </header>

        {showPythonCode ? (
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Python 版离线处理脚本 (loan_processor.py)</h2>
              <Button variant="secondary" className="bg-slate-800 text-white border-none hover:bg-slate-700 h-8 text-xs" onClick={() => {
                const code = document.getElementById('python-code-block')?.textContent || "";
                navigator.clipboard.writeText(code);
                alert("代码已复制到剪贴板");
              }}>复制完整代码</Button>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              该脚本支持读取本地 <code>loans.txt</code>、<code>repayments.txt</code> 和 <code>rates.txt</code>，并为每一行贷款生成独立的详细计划书。
            </p>
            <pre id="python-code-block" className="bg-slate-950 p-4 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed max-h-[600px]">
{`import os
import math
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

# --- 计算利息逻辑 (足月月息 + 不足月天息) ---
def calculate_interest(principal, annual_rate, start_date, end_date):
    if start_date >= end_date: return Decimal('0')
    full_months = 0
    temp = start_date
    while True:
        next_m = add_months(start_date, full_months + 1)
        if next_m > end_date: break
        full_months += 1
        temp = next_m
    extra_days = (end_date - temp).days
    m_rate = Decimal(str(annual_rate)) / 12
    d_rate = Decimal(str(annual_rate)) / 360
    return (Decimal(str(principal)) * (full_months * m_rate + extra_days * d_rate)).quantize(Decimal('0.00'), rounding=ROUND_HALF_UP)

# --- 更多逻辑见 loan_processor.py 文件内容 ---`}
            </pre>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                  贷款详情
                </h2>
                {loanInputs.length > 0 ? (
                  <div className="space-y-3">
                    <select 
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                      value={selectedLoanId || ''}
                      onChange={(e) => setSelectedLoanId(e.target.value)}
                    >
                      {loanInputs.map(loan => (
                        <option key={loan.id} value={loan.id}>
                          ¥{loan.principal.toLocaleString()} ({loan.loanDate})
                        </option>
                      ))}
                    </select>
                    {currentLoan && (
                      <div className="text-xs text-slate-500 grid grid-cols-2 gap-2">
                        <p>首期还款: {currentLoan.firstPaymentDate}</p>
                        <p>总期数: {currentLoan.totalPeriods}期</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">请上传贷款放款文档 (每行一条数据)。</p>
                )}
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-semibold mb-4">上传补充数据</h2>
                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round"/></svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium">还款记录文件</p>
                        <p className="text-[10px] text-slate-400">日期,金额</p>
                      </div>
                    </div>
                    <input type="file" className="hidden" accept=".csv,.txt" onChange={handleFileUpload('repayment')} />
                  </label>
                  
                  <label className="flex items-center justify-between p-3 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 11l5-5m0 0l5 5m-5-5v12" strokeWidth="2" strokeLinecap="round"/></svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium">利率变更文件</p>
                        <p className="text-[10px] text-slate-400">日期,新年利率</p>
                      </div>
                    </div>
                    <input type="file" className="hidden" accept=".csv,.txt" onChange={handleFileUpload('rate')} />
                  </label>
                </div>
              </div>

              <div className="bg-slate-900 p-6 rounded-2xl shadow-xl text-white">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                  AI 专家分析
                </h2>
                <textarea 
                  className="w-full h-20 bg-white/5 border border-white/10 rounded-xl p-3 text-xs placeholder:text-white/30 outline-none focus:ring-1 focus:ring-indigo-500 mb-3 resize-none"
                  placeholder="询问 AI：例如 '分析利率下调后的利息总额节省情况'"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
                <Button 
                  className="w-full bg-indigo-600 text-white hover:bg-indigo-500 border-none text-xs h-10" 
                  onClick={handleAiAnalyze}
                  isLoading={isAnalyzing}
                >
                  开始智能分析
                </Button>
                {aiAnalysis && (
                  <div className="mt-4 p-4 bg-white/5 rounded-xl text-[11px] border border-white/10 max-h-40 overflow-y-auto">
                    <p className="leading-relaxed opacity-80 whitespace-pre-wrap">{aiAnalysis}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[500px]">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-800">实时计算结果</h2>
                  {schedule.length > 0 && (
                    <div className="flex gap-6">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">利息合计</p>
                        <p className="text-lg font-bold text-rose-500">¥{stats.totalInterest.toLocaleString()}</p>
                      </div>
                      <div className="text-right border-l pl-6 border-slate-100">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">还款总额</p>
                        <p className="text-lg font-bold text-indigo-600">¥{stats.totalPayment.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {schedule.length > 0 ? (
                  <>
                    <LoanChart data={schedule} />
                    <div className="mt-8 overflow-hidden rounded-xl border border-slate-100">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 font-bold">
                              <th className="p-4">期数</th>
                              <th className="p-4">日期</th>
                              <th className="p-4">类型</th>
                              <th className="p-4 text-right">本期还款</th>
                              <th className="p-4 text-right">本金</th>
                              <th className="p-4 text-right">利息</th>
                              <th className="p-4 text-right">剩余本金</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {schedule.map((row, idx) => (
                              <tr key={`${row.period}-${idx}`} className={`group hover:bg-slate-50/50 transition-colors ${row.eventType === 'extra' ? 'bg-indigo-50/50' : ''}`}>
                                <td className="p-4 text-slate-400">{row.period}</td>
                                <td className="p-4 font-medium">{row.date}</td>
                                <td className="p-4">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.eventType === 'extra' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {row.eventType === 'extra' ? '提前' : '计划'}
                                  </span>
                                </td>
                                <td className="p-4 text-right font-bold text-slate-800">¥{row.payment.toLocaleString()}</td>
                                <td className="p-4 text-right text-slate-600">¥{row.principal.toLocaleString()}</td>
                                <td className="p-4 text-right text-rose-500 font-medium">¥{row.interest.toLocaleString()}</td>
                                <td className="p-4 text-right font-mono text-slate-400 italic">¥{row.remainingBalance.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-[400px] flex flex-col items-center justify-center text-slate-300 space-y-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center animate-pulse">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium">请先上传贷款信息文本文件...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Added missing default export
export default App;
