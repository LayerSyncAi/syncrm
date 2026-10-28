/**
 * Location search, as the website's LocationTypeahead: Google Places
 * suggestions as you type, falling back to a plain text field when no key is
 * configured (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) or Places is unreachable.
 * The value stored is the chosen place's description, the same as on the web.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Field, Ionicons } from "./ui";
import { colors, font, radius, space } from "../lib/theme";

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type Prediction = { place_id: string; description: string };

export function LocationField({
  label,
  value,
  onChange,
  error,
  placeholder = "Type to search a location",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  placeholder?: string;
}) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Only search after the person types, not when a saved value loads.
  const typed = useRef(false);

  useEffect(() => {
    if (!KEY || !typed.current) return;
    clearTimeout(timer.current);
    const input = value.trim();
    if (input.length < 2) {
      setPredictions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${KEY}`;
        const res = await fetch(url);
        const json = (await res.json()) as { status: string; predictions?: Prediction[] };
        setPredictions(json.status === "OK" ? (json.predictions ?? []).slice(0, 6) : []);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [value]);

  return (
    <View style={{ gap: space.xs }}>
      <Field
        label={label}
        value={value}
        onChangeText={(s) => {
          typed.current = true;
          onChange(s);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        error={error}
        placeholder={placeholder}
        autoCorrect={false}
      />
      {loading && <ActivityIndicator size="small" color={colors.brand} style={{ alignSelf: "flex-start" }} />}
      {focused && predictions.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, overflow: "hidden" }}>
          {predictions.map((p) => (
            <Pressable
              key={p.place_id}
              onPress={() => {
                typed.current = false;
                onChange(p.description);
                setPredictions([]);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                padding: space.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: pressed ? colors.surface : colors.card,
              })}
            >
              <Ionicons name="location-outline" size={16} color={colors.muted} />
              <Text style={{ flex: 1, fontSize: font.sm, color: colors.text }}>{p.description}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
