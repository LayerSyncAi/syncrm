import { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { currentUser } from "@/lib/mock-data";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-content-bg">
      <Sidebar isAdmin={currentUser.role === "admin"} />
      <div className="ml-[var(--sidebar-width)]">
        <Topbar userName={currentUser.fullName} />
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
