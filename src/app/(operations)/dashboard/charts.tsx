"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export function TrendChart({
  data,
}: {
  data: { day: string; kiosk: number; open: number }[];
}) {
  return (
    <figure className="insight-chart">
      <figcaption>Daily kiosk starts and unique mobile opens</figcaption>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#dfd4c7" />
          <XAxis
            dataKey="day"
            tickFormatter={(date) => date.slice(5)}
            tick={{ fontSize: 12 }}
          />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar
            dataKey="kiosk"
            name="Kiosk starts"
            fill="#6b455b"
            isAnimationActive={false}
          />
          <Bar
            dataKey="open"
            name="Mobile opens"
            fill="#95661f"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
