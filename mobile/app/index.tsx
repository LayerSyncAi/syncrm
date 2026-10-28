/** Sends each person to their home: sign in, the portal, the platform page or the Hub. */
import { Redirect } from "expo-router";
import { Loading } from "../components/ui";
import { useSession } from "../lib/session";

export default function Index() {
  const { loading, signedIn, user, isPortal, isPlatformOnly } = useSession();
  if (loading) return <Loading />;
  if (!signedIn || !user) return <Redirect href="/sign-in" />;
  if (isPortal) return <Redirect href="/portal" />;
  if (isPlatformOnly) return <Redirect href="/platform" />;
  return <Redirect href="/hub" />;
}
