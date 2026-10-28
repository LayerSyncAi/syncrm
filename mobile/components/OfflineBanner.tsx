/**
 * Shown while the phone has no connection. Screens keep the data they last
 * loaded, and changes made offline are sent by Convex once the connection
 * returns, so people can keep reading on a weak signal.
 */
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkState } from "expo-network";
import { colors, font } from "../lib/theme";

export function OfflineBanner() {
  const net = useNetworkState();
  const insets = useSafeAreaInsets();
  const offline = net.isConnected === false || net.isInternetReachable === false;
  if (!offline) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 6, paddingTop: 6, backgroundColor: colors.text }}
    >
      <Text style={{ color: "#fff", textAlign: "center", fontSize: font.sm, fontWeight: "600" }}>
        You are offline. Changes will be sent when you reconnect.
      </Text>
    </View>
  );
}
