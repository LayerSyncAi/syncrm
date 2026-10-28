import { MoreMenu } from "../../../components/MoreMenu";
import { useSession } from "../../../lib/session";

export default function CrmMore() {
  const { hub, user } = useSession();
  return (
    <MoreMenu
      isAdmin={!!hub?.isAdmin && !user?.agentMode}
      sections={[
        {
          title: "Work",
          items: [
            { label: "Owners", href: "/crm/owners", icon: "key-outline", subtitle: "Sellers and landlords" },
            { label: "Viewings", href: "/crm/viewings", icon: "create-outline", subtitle: "Signed viewing forms" },
            { label: "Tasks", href: "/crm/tasks", icon: "checkbox-outline", subtitle: "Calls, meetings and follow-ups" },
            { label: "Reports", href: "/crm/reports", icon: "bar-chart-outline" },
          ],
        },
        {
          title: "Contact tools",
          items: [
            { label: "Property matching", href: "/crm/contacts/matching", icon: "search-outline" },
            { label: "Segmentation", href: "/crm/contacts/segments", icon: "options-outline" },
          ],
        },
        {
          title: "Import and export",
          items: [
            { label: "Lead import", href: "/crm/leads/import", icon: "cloud-upload-outline" },
            { label: "Lead export", href: "/crm/leads/export", icon: "cloud-download-outline" },
            { label: "Merge duplicates", href: "/crm/leads/merge", icon: "git-merge-outline" },
            { label: "Lead source review", href: "/crm/leads/source-review", icon: "help-circle-outline" },
            { label: "PropertyBook import", href: "/crm/properties/import", icon: "download-outline" },
          ],
        },
        {
          title: "CRM settings",
          items: [
            { label: "Pipeline stages", href: "/admin/stages", icon: "git-commit-outline", adminOnly: true },
            { label: "Lead scoring", href: "/admin/lead-scoring", icon: "star-outline", adminOnly: true },
            { label: "Commissions", href: "/admin/commissions", icon: "cash-outline", adminOnly: true },
          ],
        },
        {
          title: "Assistant",
          items: [{ label: "Copilot", href: "/assistant", icon: "sparkles-outline", subtitle: "Ask about your leads and listings" }],
        },
      ]}
    />
  );
}
