import React, { useState } from 'react';
import { formatINR } from '../../utils/math';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart as PieIcon,
  ShoppingBag,
  Package,
  AlertTriangle,
  Receipt,
  Users,
  CheckCircle,
  Clock,
} from 'lucide-react';

// ============================================================================
// 1. TIME-WISE DAILY SALES, COGS & PROFIT TREND CHART (SVG)
// ============================================================================

export interface DailyTrendPoint {
  date: string;
  label: string;
  revenue: number;
  cogs: number;
  profit: number;
  billCount: number;
}

interface TimeWiseProfitTrendChartProps {
  billWiseInvoices?: Array<{
    date: string;
    grandTotal: number;
    totalCogs: number;
    profit: number;
  }>;
  dateRangeLabel?: string;
}

export const TimeWiseProfitTrendChart: React.FC<TimeWiseProfitTrendChartProps> = ({
  billWiseInvoices = [],
  dateRangeLabel = 'Selected Period',
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<DailyTrendPoint | null>(null);

  // Group by date (YYYY-MM-DD)
  const dateMap = new Map<string, DailyTrendPoint>();

  billWiseInvoices.forEach((inv) => {
    if (!inv.date) return;
    const dateKey = inv.date.split('T')[0];
    const existing = dateMap.get(dateKey) || {
      date: dateKey,
      label: new Date(dateKey).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      revenue: 0,
      cogs: 0,
      profit: 0,
      billCount: 0,
    };
    existing.revenue += inv.grandTotal;
    existing.cogs += inv.totalCogs;
    existing.profit += inv.profit;
    existing.billCount += 1;
    dateMap.set(dateKey, existing);
  });

  // Sort ascending by date
  const sortedDays = Array.from(dateMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // If empty, generate a placeholder day
  const displayDays =
    sortedDays.length > 0
      ? sortedDays
      : [
          {
            date: new Date().toISOString().split('T')[0],
            label: 'Today',
            revenue: 0,
            cogs: 0,
            profit: 0,
            billCount: 0,
          },
        ];

  const maxVal = Math.max(
    ...displayDays.map((d) => Math.max(d.revenue, d.cogs, d.profit, 100)),
    100
  );

  const totalPeriodRevenue = displayDays.reduce((s, d) => s + d.revenue, 0);
  const totalPeriodCogs = displayDays.reduce((s, d) => s + d.cogs, 0);
  const totalPeriodProfit = displayDays.reduce((s, d) => s + d.profit, 0);
  const overallMargin =
    totalPeriodRevenue > 0 ? (totalPeriodProfit / totalPeriodRevenue) * 100 : 0;

  // Chart dimensions
  const width = 640;
  const height = 220;
  const paddingX = 45;
  const paddingY = 25;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const stepX = displayDays.length > 1 ? chartW / (displayDays.length - 1) : chartW / 2;

  const pointsRev = displayDays.map((d, i) => {
    const x = paddingX + (displayDays.length > 1 ? i * stepX : chartW / 2);
    const y = height - paddingY - (d.revenue / maxVal) * chartH;
    return { x, y, data: d };
  });

  const pointsProfit = displayDays.map((d, i) => {
    const x = paddingX + (displayDays.length > 1 ? i * stepX : chartW / 2);
    const y = height - paddingY - (Math.max(0, d.profit) / maxVal) * chartH;
    return { x, y, data: d };
  });

  const pathRev = pointsRev.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  const areaRev =
    pointsRev.length > 0
      ? `${pathRev} L ${pointsRev[pointsRev.length - 1].x} ${height - paddingY} L ${
          pointsRev[0].x
        } ${height - paddingY} Z`
      : '';

  const pathProfit = pointsProfit.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
      {/* Top Header & Summary Pill Badges */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Time-Wise Daily Sales &amp; True Profit Trend
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Day-by-day revenue velocity vs wholesale COGS &amp; net gross profit ({dateRangeLabel})
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400 inline-block" />
            <span className="text-slate-600 dark:text-slate-300 font-medium">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span className="text-slate-600 dark:text-slate-300 font-medium">Gross Profit</span>
          </div>
        </div>
      </div>

      {/* Mini KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        <div className="bg-blue-50/60 dark:bg-blue-950/30 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/50">
          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">
            Total Revenue
          </span>
          <p className="text-sm font-extrabold text-blue-950 dark:text-blue-200">
            {formatINR(totalPeriodRevenue)}
          </p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
            Wholesale COGS
          </span>
          <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            {formatINR(totalPeriodCogs)}
          </p>
        </div>
        <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
            Gross Margin
          </span>
          <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
            {formatINR(totalPeriodProfit)}
          </p>
        </div>
        <div className="bg-purple-50/60 dark:bg-purple-950/30 p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/50">
          <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase">
            Average Margin %
          </span>
          <p className="text-sm font-extrabold text-purple-900 dark:text-purple-300">
            {overallMargin.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Responsive SVG Chart */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = height - paddingY - ratio * chartH;
            const val = Math.round(ratio * maxVal);
            return (
              <g key={idx}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-100 dark:text-slate-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingX - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-400 font-mono"
                >
                  ₹{val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                </text>
              </g>
            );
          })}

          {/* Area under revenue */}
          {areaRev && <path d={areaRev} fill="url(#revenueGradient)" />}

          {/* Path for Revenue */}
          {pathRev && (
            <path
              d={pathRev}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Path for Profit */}
          {pathProfit && (
            <path
              d={pathProfit}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeDasharray="4 2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points */}
          {pointsRev.map((pt, idx) => (
            <g
              key={idx}
              className="cursor-pointer group"
              onMouseEnter={() => setHoveredPoint(pt.data)}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              {/* Invisible touch target */}
              <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />
              {/* Visible circle */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r="4.5"
                className="fill-blue-600 dark:fill-blue-400 stroke-white dark:stroke-slate-900 stroke-2 transition-transform group-hover:scale-150"
              />
              {/* X Axis Label */}
              <text
                x={pt.x}
                y={height - paddingY + 16}
                textAnchor="middle"
                className="text-[10px] fill-slate-500 dark:fill-slate-400 font-medium"
              >
                {pt.data.label}
              </text>
            </g>
          ))}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div className="absolute top-2 right-4 bg-slate-900/95 dark:bg-slate-800/95 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 backdrop-blur-xs border border-slate-700 pointer-events-none transition-all">
            <div className="font-bold border-b border-slate-700 pb-1 text-slate-200">
              📅 {hoveredPoint.label} ({hoveredPoint.billCount} bills)
            </div>
            <div className="flex justify-between gap-4 text-blue-300">
              <span>Sales:</span>
              <span className="font-bold">{formatINR(hoveredPoint.revenue)}</span>
            </div>
            <div className="flex justify-between gap-4 text-slate-300">
              <span>COGS:</span>
              <span className="font-bold">{formatINR(hoveredPoint.cogs)}</span>
            </div>
            <div className="flex justify-between gap-4 text-emerald-300 font-bold">
              <span>Gross Profit:</span>
              <span>{formatINR(hoveredPoint.profit)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. TOP PRODUCT MARGIN & REVENUE DISTRIBUTION (HORIZONTAL BARS)
// ============================================================================

interface ProductMarginDistributionChartProps {
  items?: Array<{
    name: string;
    category: string;
    qtySold: number;
    revenue: number;
    cogs: number;
    profit: number;
    marginPct: number;
  }>;
}

export const ProductMarginDistributionChart: React.FC<ProductMarginDistributionChartProps> = ({
  items = [],
}) => {
  // Take top 6 items by revenue
  const topProducts = [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const maxRevenue = Math.max(...topProducts.map((p) => p.revenue), 100);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Top Products Margin &amp; Sales Velocity
        </h3>
        <span className="text-[10px] font-semibold text-slate-400 uppercase">Top 6 by Volume</span>
      </div>

      {topProducts.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center italic">
          No product sales recorded in this period.
        </p>
      ) : (
        <div className="space-y-3 pt-1">
          {topProducts.map((prod, idx) => {
            const barWidthPct = Math.min(100, Math.max(5, (prod.revenue / maxRevenue) * 100));
            const isHighMargin = prod.marginPct >= 15;
            const isMedMargin = prod.marginPct >= 8 && prod.marginPct < 15;

            return (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {prod.name}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      ({prod.qtySold} sold)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatINR(prod.revenue)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                        isHighMargin
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : isMedMargin
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {prod.marginPct.toFixed(1)}% margin
                    </span>
                  </div>
                </div>

                {/* Visual Bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${barWidthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. KHATA AGING & CREDIT RISK DONUT CHART (SVG)
// ============================================================================

interface KhataAgingDistributionChartProps {
  totalOutstanding?: number;
  totalIn0to15?: number;
  totalIn16to30?: number;
  totalInAbove30?: number;
  highRiskCount?: number;
}

export const KhataAgingDistributionChart: React.FC<KhataAgingDistributionChartProps> = ({
  totalOutstanding = 0,
  totalIn0to15 = 0,
  totalIn16to30 = 0,
  totalInAbove30 = 0,
  highRiskCount = 0,
}) => {
  const safe = totalIn0to15;
  const mod = totalIn16to30;
  const crit = totalInAbove30;
  const total = totalOutstanding > 0 ? totalOutstanding : safe + mod + crit;

  const pctSafe = total > 0 ? (safe / total) * 100 : 0;
  const pctMod = total > 0 ? (mod / total) * 100 : 0;
  const pctCrit = total > 0 ? (crit / total) * 100 : 0;

  // Donut circumference (radius = 40, circum = 2 * pi * 40 ~= 251.32)
  const radius = 40;
  const circum = 2 * Math.PI * radius;

  const strokeSafe = (pctSafe / 100) * circum;
  const strokeMod = (pctMod / 100) * circum;
  const strokeCrit = (pctCrit / 100) * circum;

  const offsetSafe = 0;
  const offsetMod = strokeSafe;
  const offsetCrit = strokeSafe + strokeMod;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <PieIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          Khata Credit Aging &amp; Recovery Risk
        </h3>
        {highRiskCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 animate-pulse">
            {highRiskCount} Overdue &gt; 30d
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-around gap-4 pt-1">
        {/* SVG Donut */}
        <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="stroke-slate-100 dark:stroke-slate-800"
              strokeWidth="12"
              fill="transparent"
            />
            {total > 0 && (
              <>
                {/* 0-15 Days (Green) */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray={`${strokeSafe} ${circum}`}
                  strokeDashoffset={-offsetSafe}
                  fill="transparent"
                  strokeLinecap="round"
                />
                {/* 16-30 Days (Amber) */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke="#f59e0b"
                  strokeWidth="12"
                  strokeDasharray={`${strokeMod} ${circum}`}
                  strokeDashoffset={-offsetMod}
                  fill="transparent"
                  strokeLinecap="round"
                />
                {/* >30 Days (Red) */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke="#ef4444"
                  strokeWidth="12"
                  strokeDasharray={`${strokeCrit} ${circum}`}
                  strokeDashoffset={-offsetCrit}
                  fill="transparent"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
            <span className="text-[9px] uppercase font-bold text-slate-400">Total Khata</span>
            <span className="text-xs font-black text-slate-900 dark:text-white leading-tight">
              {formatINR(total)}
            </span>
          </div>
        </div>

        {/* Breakdown Legend */}
        <div className="space-y-2 w-full sm:w-auto">
          <div className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">0 - 15 Days</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-slate-900 dark:text-white">
                {formatINR(safe)}
              </span>
              <span className="text-[10px] text-slate-400 ml-1">({pctSafe.toFixed(0)}%)</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">16 - 30 Days</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-slate-900 dark:text-white">
                {formatINR(mod)}
              </span>
              <span className="text-[10px] text-slate-400 ml-1">({pctMod.toFixed(0)}%)</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-red-700 dark:text-red-400 font-bold">&gt; 30 Days</span>
            </div>
            <div className="text-right">
              <span className="font-extrabold text-red-600 dark:text-red-400">
                {formatINR(crit)}
              </span>
              <span className="text-[10px] text-red-500 ml-1">({pctCrit.toFixed(0)}%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. INVENTORY CAPITAL ALLOCATION & DEAD-STOCK GAUGE
// ============================================================================

interface StockCapitalDistributionChartProps {
  items?: Array<{
    category: string;
    lockedCapital: number;
    isDeadStock: boolean;
  }>;
  totalLockedCapital?: number;
  totalDeadStockValuation?: number;
  deadStockCount?: number;
}

export const StockCapitalDistributionChart: React.FC<StockCapitalDistributionChartProps> = ({
  items = [],
  totalLockedCapital = 0,
  totalDeadStockValuation = 0,
  deadStockCount = 0,
}) => {
  // Aggregate by category
  const catMap = new Map<string, number>();
  items.forEach((it) => {
    const c = it.category || 'General';
    catMap.set(c, (catMap.get(c) || 0) + it.lockedCapital);
  });

  const catRows = Array.from(catMap.entries())
    .map(([category, val]) => ({
      category,
      val,
      pct: totalLockedCapital > 0 ? (val / totalLockedCapital) * 100 : 0,
    }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);

  const deadStockPct =
    totalLockedCapital > 0 ? (totalDeadStockValuation / totalLockedCapital) * 100 : 0;
  const activeCapital = Math.max(0, totalLockedCapital - totalDeadStockValuation);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <Package className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          Working Capital &amp; Dead-Stock Exposure
        </h3>
        <span className="text-[10px] font-semibold text-slate-400 uppercase">
          Total: {formatINR(totalLockedCapital)}
        </span>
      </div>

      {/* Dead Stock Progress Bar */}
      <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex justify-between text-xs">
          <span className="text-slate-600 dark:text-slate-400 font-medium">
            Active Stock ({formatINR(activeCapital)})
          </span>
          <span className="text-red-600 dark:text-red-400 font-extrabold">
            Dead Stock ({formatINR(totalDeadStockValuation)} - {deadStockPct.toFixed(1)}%)
          </span>
        </div>
        <div className="w-full bg-emerald-500 rounded-full h-2.5 overflow-hidden flex">
          <div
            className="h-full bg-red-500 rounded-r-full"
            style={{ width: `${Math.min(100, deadStockPct)}%` }}
            title={`Dead Stock: ${formatINR(totalDeadStockValuation)}`}
          />
        </div>
        <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
          <span>Fast moving inventory</span>
          <span>{deadStockCount} items dormant 45+ days</span>
        </div>
      </div>

      {/* Top Categories Allocation */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
          Top Category Capital Allocation
        </span>
        {catRows.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No inventory categories available.</p>
        ) : (
          <div className="space-y-2">
            {catRows.map((cat, i) => (
              <div key={i} className="space-y-1 text-xs">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-700 dark:text-slate-300">{cat.category}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatINR(cat.val)}{' '}
                    <span className="text-slate-400 font-normal">({cat.pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-purple-600 dark:bg-purple-500 rounded-full"
                    style={{ width: `${cat.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 5. GALLA DRAWER CASH RECONCILIATION & GST TAX BREAKDOWN
// ============================================================================

interface GallaAndTaxOverviewProps {
  totalExpectedCash?: number;
  totalActualCash?: number;
  totalDiscrepancy?: number;
  taxBreakdown?: Array<{
    rate: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    totalGst: number;
  }>;
}

export const GallaAndTaxOverview: React.FC<GallaAndTaxOverviewProps> = ({
  totalExpectedCash = 0,
  totalActualCash = 0,
  totalDiscrepancy = 0,
  taxBreakdown = [],
}) => {
  const isSurplus = totalDiscrepancy > 0;
  const isDeficit = totalDiscrepancy < 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
      {/* Galla Drawer Cash Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          Galla Drawer &amp; Counter Cash Flow
        </h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Expected Cash</span>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
              {formatINR(totalExpectedCash)}
            </p>
          </div>
          <div className="bg-blue-50/60 dark:bg-blue-950/30 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/50">
            <span className="text-[10px] text-blue-700 dark:text-blue-300 uppercase font-bold">
              Actual Counted
            </span>
            <p className="text-sm font-extrabold text-blue-950 dark:text-blue-200 mt-0.5">
              {formatINR(totalActualCash)}
            </p>
          </div>
          <div
            className={`p-2.5 rounded-xl border ${
              isDeficit
                ? 'bg-red-50/70 border-red-200 dark:bg-red-950/30 dark:border-red-900/50'
                : isSurplus
                ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50'
                : 'bg-slate-50 border-slate-200 dark:bg-slate-800/60 dark:border-slate-800'
            }`}
          >
            <span
              className={`text-[10px] uppercase font-bold ${
                isDeficit
                  ? 'text-red-700 dark:text-red-300'
                  : isSurplus
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-500'
              }`}
            >
              Discrepancy
            </span>
            <p
              className={`text-sm font-extrabold mt-0.5 ${
                isDeficit
                  ? 'text-red-600 dark:text-red-400'
                  : isSurplus
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {isDeficit ? `- ${formatINR(Math.abs(totalDiscrepancy))}` : formatINR(totalDiscrepancy)}
            </p>
          </div>
        </div>
      </div>

      {/* Tax Slabs Breakdown */}
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5 text-blue-500" />
          GST Tax Slabs Distribution
        </h4>
        {taxBreakdown.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No tax transactions recorded.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {taxBreakdown.map((t, idx) => (
              <div
                key={idx}
                className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                  <span>{t.rate}% GST</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {formatINR(t.totalGst)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Taxable: {formatINR(t.taxableAmount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

