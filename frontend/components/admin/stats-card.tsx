import { TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  change?: number;
  description?: string;
  colorClass?: string;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  change,
  description,
  colorClass = "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
}: StatsCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        {change !== undefined && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${
              change >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {change >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            {change >= 0 ? "+" : ""}
            {change}%
          </div>
        )}
      </div>

      <p className="text-2xl font-bold text-slate-900 dark:text-white">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{title}</p>
      {description && (
        <p className="text-xs text-slate-400 mt-1">{description}</p>
      )}
    </div>
  );
}

export default StatsCard;
