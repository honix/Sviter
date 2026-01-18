import { useMemo } from 'react';
import Papa from 'papaparse';
import {
  LineChart,
  BarChart,
  PieChart,
  AreaChart,
  Line,
  Bar,
  Pie,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export type ChartType = 'line' | 'bar' | 'pie' | 'area';

interface ChartViewerProps {
  csvData: string;
  chartType?: ChartType;
  title?: string;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--accent))',
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7c7c',
  '#a28dff',
];

function parseCSV(csv: string): Array<Record<string, any>> {
  // Use papaparse for proper CSV parsing (handles quotes, escapes, etc.)
  const result = Papa.parse(csv.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true, // Auto-converts numbers
    transform: (value) => {
      // Handle empty strings - keep as string instead of converting to 0
      const trimmed = value.trim();
      if (trimmed === '') return trimmed;

      // Try to parse as number, otherwise keep as string
      const num = Number(trimmed);
      return trimmed !== '' && !isNaN(num) ? num : trimmed;
    },
  });

  if (result.errors.length > 0) {
    console.error('CSV parsing errors:', result.errors);
  }

  return result.data as Array<Record<string, any>>;
}

function detectChartType(data: Array<Record<string, any>>): ChartType {
  if (data.length === 0) return 'bar';

  const keys = Object.keys(data[0]);
  const numericKeys = keys.filter((key) => typeof data[0][key] === 'number');

  // If only one numeric column and few rows, suggest pie chart
  if (numericKeys.length === 1 && data.length <= 10) {
    return 'pie';
  }

  // Default to line chart for time series data
  return 'line';
}

export function ChartViewer({ csvData, chartType, title }: ChartViewerProps) {
  const data = useMemo(() => parseCSV(csvData), [csvData]);

  const detectedChartType = chartType || detectChartType(data);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-md bg-muted/10">
        <p className="text-muted-foreground">No data to display</p>
      </div>
    );
  }

  const keys = Object.keys(data[0]);
  const xKey = keys[0]; // First column is X-axis
  const dataKeys = keys.slice(1).filter((key) => typeof data[0][key] === 'number');

  const renderChart = () => {
    switch (detectedChartType) {
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {dataKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {dataKeys.map((key, index) => (
              <Bar key={key} dataKey={key} fill={COLORS[index % COLORS.length]} />
            ))}
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {dataKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                fill={COLORS[index % COLORS.length]}
                stroke={COLORS[index % COLORS.length]}
              />
            ))}
          </AreaChart>
        );

      case 'pie':
        // For pie charts, use the first numeric column
        const pieDataKey = dataKeys[0];
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={pieDataKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            >
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full my-4">
      {title && <h3 className="text-lg font-semibold mb-2">{title}</h3>}
      <ResponsiveContainer width="100%" height={400}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
