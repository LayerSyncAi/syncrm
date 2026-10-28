import { MoreMenu } from "../../../components/MoreMenu";
import { useSession } from "../../../lib/session";

export default function WorthMore() {
  const { hub, user } = useSession();
  return (
    <MoreMenu
      isAdmin={!!hub?.isAdmin && !user?.agentMode}
      sections={[
        {
          title: "Valuations",
          items: [
            { label: "Log instruction", href: "/worth/jobs/new", icon: "add-circle-outline" },
            { label: "Archive", href: "/worth/archive", icon: "archive-outline", subtitle: "Every issued valuation" },
            { label: "Reports", href: "/worth/reports", icon: "bar-chart-outline" },
          ],
        },
        {
          title: "Settings",
          items: [
            { label: "Worth settings and valuer profiles", href: "/worth/settings", icon: "settings-outline", subtitle: "Your registration number and signature" },
          ],
        },
      ]}
    />
  );
}
