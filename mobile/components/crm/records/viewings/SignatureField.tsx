/**
 * Signature capture for viewing forms. The person signs with a finger on a
 * full-screen pad (react-native-svg paths drawn from PanResponder touches).
 * The pad is captured as a PNG and uploaded to Convex storage, the same
 * storage id the website's canvas pad produces. A photo of a signature can be
 * uploaded instead.
 */
import { useRef, useState, type ComponentRef } from "react";
import { Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button, Row } from "../../../ui";
import { choosePhoto, uploadFile } from "../../../../lib/files";
import { useRun } from "../../../../lib/useRun";
import { colors, font, radius, space } from "../../../../lib/theme";

export type SignatureValue = { storageId: string; url: string };

type Point = { x: number; y: number };

function toPath(points: Point[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  if (rest.length === 0) return `M${first!.x},${first!.y} l0.1,0.1`;
  return `M${first!.x},${first!.y} ` + rest.map((p) => `L${p.x},${p.y}`).join(" ");
}

/** Full-screen drawing pad. Calls onDone with the PNG file uri. */
function SignPad({ open, title, onCancel, onDone }: { open: boolean; title: string; onCancel: () => void; onDone: (uri: string) => Promise<void> }) {
  const padRef = useRef<ComponentRef<typeof View>>(null);
  const strokes = useRef<Point[][]>([]);
  const [, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const redraw = () => setTick((t) => t + 1);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        strokes.current.push([{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]);
        redraw();
      },
      onPanResponderMove: (e) => {
        strokes.current[strokes.current.length - 1]?.push({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
        redraw();
      },
    })
  ).current;

  const clear = () => {
    strokes.current = [];
    redraw();
  };
  const empty = strokes.current.length === 0;

  const save = async () => {
    if (empty || !padRef.current) return;
    setSaving(true);
    try {
      const uri = await captureRef(padRef.current as unknown as Parameters<typeof captureRef>[0], { format: "png", quality: 1, result: "tmpfile" });
      await onDone(uri);
      clear();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onCancel} supportedOrientations={["portrait", "landscape"]}>
      <SafeAreaView style={styles.padScreen}>
        <Text style={styles.padTitle}>{title}</Text>
        <Text style={styles.padHint}>Sign inside the box with your finger.</Text>
        <View ref={padRef} collapsable={false} style={styles.pad} {...responder.panHandlers}>
          {/* Touches land on the pad itself so locationX/Y stay relative to it. */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
              {strokes.current.map((s, i) => (
                <Path key={i} d={toPath(s)} stroke="#111827" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ))}
            </Svg>
          </View>
        </View>
        <Row style={{ justifyContent: "space-between" }}>
          <Button variant="ghost" title="Cancel" onPress={onCancel} disabled={saving} />
          <Row>
            <Button variant="secondary" title="Clear" onPress={clear} disabled={empty || saving} />
            <Button title="Save signature" onPress={save} loading={saving} disabled={empty} />
          </Row>
        </Row>
      </SafeAreaView>
    </Modal>
  );
}

export function SignatureField({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: SignatureValue | null;
  onChange: (v: SignatureValue | null) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { busy, run } = useRun();
  const [drawing, setDrawing] = useState(false);

  const upload = async (uri: string, mimeType: string, name: string) => {
    const storageId = await run(() => uploadFile(() => generateUploadUrl({}), { uri, mimeType, name }));
    if (storageId) {
      onChange({ storageId, url: uri });
      setDrawing(false);
    }
  };

  const fromPhoto = async () => {
    const photo = await choosePhoto();
    if (photo) await upload(photo.uri, photo.mimeType, photo.name);
  };

  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
        {value && !disabled ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10}>
            <Text style={{ color: colors.danger, fontSize: font.sm }}>Remove</Text>
          </Pressable>
        ) : null}
      </Row>
      {value ? (
        <View style={styles.preview}>
          <Image source={{ uri: value.url }} style={{ flex: 1, height: 64 }} resizeMode="contain" />
          <Text style={{ color: colors.success, fontSize: font.xs, fontWeight: "700" }}>Signed</Text>
        </View>
      ) : disabled ? (
        <View style={styles.preview}>
          <Text style={{ color: colors.faint, fontSize: font.sm }}>No signature</Text>
        </View>
      ) : (
        <Row>
          <Button small variant="secondary" icon="create-outline" title="Sign" onPress={() => setDrawing(true)} loading={busy} style={{ flex: 1 }} />
          <Button small variant="ghost" icon="image-outline" title="Upload image" onPress={fromPhoto} disabled={busy} />
        </Row>
      )}
      <SignPad open={drawing} title={label} onCancel={() => setDrawing(false)} onDone={(uri) => upload(uri, "image/png", `signature-${Date.now()}.png`)} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: font.sm, fontWeight: "600", color: colors.text },
  preview: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: "#fff", padding: space.sm, minHeight: 64 },
  padScreen: { flex: 1, backgroundColor: colors.background, padding: space.lg, gap: space.md },
  padTitle: { fontSize: font.xl, fontWeight: "700", color: colors.text },
  padHint: { fontSize: font.sm, color: colors.muted },
  pad: { flex: 1, backgroundColor: "#ffffff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, overflow: "hidden" },
});
