import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-text-dim">
              SynCRM
            </p>
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="text-sm text-text-muted">
              Use your agency credentials to access the pipeline.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-muted">Email</label>
            <Input type="email" placeholder="you@agency.com" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-muted">Password</label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="flex items-center justify-between text-xs text-text-dim">
            <span>Need access? Contact admin.</span>
            <Link href="/app/dashboard" className="text-primary">
              Demo login
            </Link>
          </div>
          <Button className="w-full">Sign in</Button>
        </CardContent>
      </Card>
    </main>
  );
}
