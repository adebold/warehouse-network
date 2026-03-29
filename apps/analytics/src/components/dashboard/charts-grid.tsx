'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

async function fetchChartsData() {
  const response = await fetch('/api/analytics/charts');
  if (!response.ok) throw new Error('Failed to fetch charts data');
  return response.json();
}

// Mock data for development
const mockData = {
  revenueChart: [
    { date: '2024-03-01', revenue: 12000, bookings: 45 },
    { date: '2024-03-02', revenue: 15000, bookings: 52 },
    { date: '2024-03-03', revenue: 11000, bookings: 38 },
    { date: '2024-03-04', revenue: 18000, bookings: 65 },
    { date: '2024-03-05', revenue: 16000, bookings: 58 },
    { date: '2024-03-06', revenue: 21000, bookings: 72 },
    { date: '2024-03-07', revenue: 19000, bookings: 68 }
  ],
  userActivity: [
    { time: '00:00', users: 120 },
    { time: '04:00', users: 89 },
    { time: '08:00', users: 456 },
    { time: '12:00', users: 678 },
    { time: '16:00', users: 543 },
    { time: '20:00', users: 234 }
  ],
  warehouseTypes: [
    { name: 'Climate Controlled', value: 35, count: 142 },
    { name: 'Standard Storage', value: 45, count: 189 },
    { name: 'Cold Storage', value: 12, count: 56 },
    { name: 'Hazmat Certified', value: 8, count: 23 }
  ],
  topWarehouses: [
    { name: 'Downtown Logistics Hub', bookings: 89, revenue: 25000 },
    { name: 'Port Storage Center', bookings: 76, revenue: 21000 },
    { name: 'Industrial Park West', bookings: 65, revenue: 18500 },
    { name: 'Airport Cargo Facility', bookings: 54, revenue: 16200 },
    { name: 'Metro Distribution', bookings: 43, revenue: 12800 }
  ]
};

export function ChartsGrid() {
  const { data: chartsData, isLoading } = useQuery({
    queryKey: ['charts-data'],
    queryFn: fetchChartsData,
    refetchInterval: 60000, // Refetch every minute
  });

  const data = chartsData || mockData;

  if (isLoading) {
    return (
      <div className="grid gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LoadingSkeleton className="h-80" />
          <LoadingSkeleton className="h-80" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LoadingSkeleton className="h-80" />
          <LoadingSkeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Revenue and Bookings Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue & Bookings Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.revenueChart}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === 'revenue' ? `$${value.toLocaleString()}` : value,
                    name === 'revenue' ? 'Revenue' : 'Bookings'
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#8884d8"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>User Activity (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.userActivity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="#00C49F"
                    strokeWidth={2}
                    dot={{ fill: '#00C49F' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Warehouse Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Warehouse Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.warehouseTypes}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {data.warehouseTypes.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Warehouses */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Warehouses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topWarehouses} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === 'revenue' ? `$${value.toLocaleString()}` : value,
                    name === 'revenue' ? 'Revenue' : 'Bookings'
                  ]}
                />
                <Bar dataKey="bookings" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}