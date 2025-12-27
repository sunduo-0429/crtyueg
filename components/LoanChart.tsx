
import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { RepaymentRow } from '../types';

interface LoanChartProps {
  data: RepaymentRow[];
}

export const LoanChart: React.FC<LoanChartProps> = ({ data }) => {
  return (
    <div className="h-[300px] w-full mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorInterest" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#64748b' }}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(val) => `¥${(val / 1000).toFixed(0)}k`}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          />
          <Legend verticalAlign="top" height={36}/>
          <Area 
            type="monotone" 
            dataKey="principal" 
            stroke="#4f46e5" 
            fillOpacity={1} 
            fill="url(#colorPrincipal)" 
            name="Principal"
          />
          <Area 
            type="monotone" 
            dataKey="interest" 
            stroke="#f43f5e" 
            fillOpacity={1} 
            fill="url(#colorInterest)" 
            name="Interest"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
