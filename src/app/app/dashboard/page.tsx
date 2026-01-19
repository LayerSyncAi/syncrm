import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { stageSummary } from "@/lib/mock-data";

const stats = [
  { label: "New leads this week", value: "18" },
  { label: "Open leads", value: "42" },
  { label: "Won this month", value: "6" },
  { label: "Lost this month", value: "2" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Pipeline Overview</h2>
                <Badge className="bg-primary/10 text-primary">All Leads</Badge>
              </div>
              <p className="text-sm text-text-muted">
                Monitor your weekly performance and conversion velocity.
              </p>
            </div>
            <div className="min-w-[220px]">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Monthly progress</span>
                <span>63%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-border">
                <div className="h-2 w-[63%] rounded-full bg-primary" />
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-text-dim">
              {stat.label}
            </p>
            <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Leads by Stage
            </h3>
            <span className="text-xs text-text-dim">Last 30 days</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {stageSummary.map((stage) => (
            <div key={stage.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{stage.name}</span>
                <span className="text-text-muted">{stage.count}</span>
              </div>
              <div className="h-2 rounded-full bg-border">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${stage.percent * 100}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
