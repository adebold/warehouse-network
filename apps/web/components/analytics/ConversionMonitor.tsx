import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Activity,
  Target,
  MousePointer,
  Clock
} from 'lucide-react'

interface ConversionData {
  conversionRate: number
  totalConversions: number
  conversionValue: number
  topConversions: Array<{
    name: string
    count: number
    value: number
  }>
}

interface EngagementData {
  avgTimeOnPage: number
  avgScrollDepth: number
  bounceRate: number
  ctaClicks: Record<string, number>
}

export const ConversionMonitor: React.FC = () => {
  const [conversionData, setConversionData] = useState<ConversionData>({
    conversionRate: 3.2,
    totalConversions: 156,
    conversionValue: 28900,
    topConversions: [
      { name: 'Partner Application Submit', count: 45, value: 18500 },
      { name: 'Login Success', count: 89, value: 8900 },
      { name: 'Search Intent', count: 312, value: 1500 },
      { name: 'Warehouse View', count: 567, value: 0 }
    ]
  })

  const [engagementData, setEngagementData] = useState<EngagementData>({
    avgTimeOnPage: 234, // seconds
    avgScrollDepth: 65, // percentage
    bounceRate: 32, // percentage
    ctaClicks: {
      'get_started': 234,
      'browse_listings': 189,
      'list_property': 156,
      'start_earning_now': 89,
      'calculate_revenue': 67
    }
  })

  // In production, this would fetch from your analytics API
  useEffect(() => {
    // Simulate real-time updates
    const interval = setInterval(() => {
      setConversionData(prev => ({
        ...prev,
        totalConversions: prev.totalConversions + Math.floor(Math.random() * 3),
        conversionValue: prev.conversionValue + Math.floor(Math.random() * 500)
      }))
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionData.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">+12% from last week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Conversions</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionData.totalConversions}</div>
            <p className="text-xs text-muted-foreground">Today's total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversion Value</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${conversionData.conversionValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Estimated monthly revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg. Time on Site</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(engagementData.avgTimeOnPage)}</div>
            <p className="text-xs text-muted-foreground">
              {engagementData.bounceRate}% bounce rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {conversionData.topConversions.map((conversion, index) => (
              <div key={conversion.name} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{conversion.name}</span>
                  <span className="font-medium">{conversion.count}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary rounded-full h-2 transition-all"
                    style={{ 
                      width: `${(conversion.count / conversionData.topConversions[0].count) * 100}%` 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CTA Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MousePointer className="h-4 w-4" />
            CTA Click Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(engagementData.ctaClicks)
              .sort(([,a], [,b]) => b - a)
              .map(([cta, clicks]) => (
                <div key={cta} className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {cta.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{clicks}</span>
                    <span className="text-xs text-muted-foreground">clicks</span>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Engagement Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Avg. Scroll Depth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold">{engagementData.avgScrollDepth}%</div>
              <Activity className="h-5 w-5 text-muted-foreground mb-1" />
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-green-600"
                style={{ width: `${engagementData.avgScrollDepth}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Form Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold">68%</div>
              <Users className="h-5 w-5 text-muted-foreground mb-1" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Partner application form
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Search to View Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold">42%</div>
              <BarChart3 className="h-5 w-5 text-muted-foreground mb-1" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Of searches result in listing views
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Analytics Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline" size="sm">
            View Full Report
          </Button>
          <Button variant="outline" size="sm">
            Export Data
          </Button>
          <Button variant="outline" size="sm">
            Configure Goals
          </Button>
          <Button variant="outline" size="sm">
            Set Up Alerts
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}