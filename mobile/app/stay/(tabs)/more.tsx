import { MoreMenu } from "../../../components/MoreMenu";
import { useSession } from "../../../lib/session";

export default function StayMore() {
  const { hub, user } = useSession();
  return (
    <MoreMenu
      isAdmin={!!hub?.isAdmin && !user?.agentMode}
      sections={[
        {
          title: "Money",
          items: [
            { label: "Record payment", href: "/stay/payments/record", icon: "receipt-outline" },
            { label: "Payments", href: "/stay/payments", icon: "card-outline" },
            { label: "Deposits", href: "/stay/deposits", icon: "wallet-outline" },
            { label: "Landlord statements", href: "/stay/statements", icon: "document-text-outline" },
          ],
        },
        {
          title: "People",
          items: [{ label: "Tenants", href: "/stay/tenants", icon: "people-outline" }],
        },
        {
          title: "Operations",
          items: [
            { label: "Maintenance", href: "/stay/maintenance", icon: "construct-outline" },
            { label: "Inspections", href: "/stay/inspections", icon: "clipboard-outline" },
          ],
        },
        {
          title: "Reports and settings",
          items: [
            { label: "Reports", href: "/stay/reports", icon: "bar-chart-outline" },
            { label: "Import from Excel", href: "/stay/import", icon: "cloud-upload-outline", adminOnly: true },
            { label: "Stay settings", href: "/stay/settings", icon: "settings-outline", adminOnly: true },
          ],
        },
      ]}
    />
  );
}
