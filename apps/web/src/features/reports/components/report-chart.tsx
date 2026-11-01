import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
}

/** Simple grouped bar chart; the matching table next to it is the accessible data source. */
export function ReportChart({
  label, data, series, format,
}: {
  label: string;
  data: Record<string, string | number>[];
  series: ChartSeries[];
  format?: (n: number) => string;
}) {
  return (
    <div role="img" aria-label={label} className="h-64 w-full rounded-lg border bg-card p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" />
          <YAxis tickFormatter={format} width={70} />
          <Tooltip formatter={(v) => (format ? format(Number(v)) : String(v))} />
          <Legend />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
