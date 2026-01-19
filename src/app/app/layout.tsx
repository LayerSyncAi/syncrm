"use client";

import { ReactNode, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { currentUser } from "@/lib/mock-data";

export default function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-content-bg">
      <Sidebar
        isAdmin={currentUser.role === "admin"}
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
      />
      <div
        className="transition-[margin] duration-200"
        style={{
          marginLeft: collapsed
            ? "var(--sidebar-width-collapsed)"
            : "var(--sidebar-width)",
        }}
      >
        <Topbar userName={currentUser.fullName} />
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
