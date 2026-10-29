/** Sends each person to their home: sign in, the portal, the platform page or their role's landing page. */
import { Redirect, type Href } from "expo-router";
import { Loading } from "../components/ui";
import { appRoute } from "../lib/routes";
import { useSession } from "../lib/session";

export default function Index() {
  const { loading, signedIn, user, hub, isPortal, isPlatformOnly } = useSession();
  if (loading) return <Loading />;
  if (!signedIn || !user) return <Redirect href="/sign-in" />;
  if (isPortal) return <Redirect href="/portal" />;
  if (isPlatformOnly) return <Redirect href="/platform" />;
  // HB-51: the server picks each role's landing page as a website link.
  return <Redirect href={(appRoute(hub?.landingHref) ?? "/hub") as Href} />;
}
