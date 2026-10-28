/** Hub admin menu. Agency settings are readable by everyone; the rest are admins only. */
import { useRouter, type Href } from "expo-router";
import { ListItem, Screen } from "../../components/ui";
import { AdminGuard } from "../../components/admin/AdminGuard";

const ITEMS: Array<{ icon: React.ComponentProps<typeof ListItem>["icon"]; title: string; subtitle: string; href: string }> = [
  { icon: "people-outline", title: "Users", subtitle: "Accounts, roles and access", href: "/admin/users" },
  { icon: "shield-checkmark-outline", title: "Roles", subtitle: "Who is an admin", href: "/admin/roles" },
  { icon: "business-outline", title: "Agency settings", subtitle: "Details printed on receipts and reports", href: "/admin/settings" },
  { icon: "document-text-outline", title: "Logs", subtitle: "Audit trail and email log", href: "/admin/logs" },
  { icon: "git-branch-outline", title: "Pipeline stages", subtitle: "Order and outcomes of lead stages", href: "/admin/stages" },
  { icon: "speedometer-outline", title: "Lead scoring", subtitle: "Criteria and weights", href: "/admin/lead-scoring" },
  { icon: "cash-outline", title: "Commissions", subtitle: "Split scenarios and deal commissions", href: "/admin/commissions" },
];

export default function AdminMenu() {
  const router = useRouter();
  return (
    <AdminGuard>
      <Screen>
        {ITEMS.map((i) => (
          <ListItem key={i.href} icon={i.icon} title={i.title} subtitle={i.subtitle} onPress={() => router.push(i.href as Href)} />
        ))}
      </Screen>
    </AdminGuard>
  );
}
