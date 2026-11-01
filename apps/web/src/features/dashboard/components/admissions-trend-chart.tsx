import type { DashboardDto } from '@lc/shared';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function AdmissionsTrendChart({ trend }: { trend: DashboardDto['admissionsTrend'] }) {
  const data = trend.map((t) => ({
    name: `T${t.month.slice(5)}`,
    leads: t.leads,
    profiles: t.profiles,
  }));
  return (
    <>
      <div
        role="img"
        aria-label="Tuyển sinh 6 tháng gần nhất"
        className="h-64 w-full rounded-lg border bg-card p-2"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} width={40} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="leads"
              name="Lead mới"
              stroke="var(--chart-1)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="profiles"
              name="Hồ sơ mới"
              stroke="var(--chart-2)"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table aria-label="Số liệu tuyển sinh 6 tháng" className="sr-only">
        <thead>
          <tr>
            <th scope="col">Tháng</th>
            <th scope="col">Lead mới</th>
            <th scope="col">Hồ sơ mới</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{d.leads}</td>
              <td>{d.profiles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
