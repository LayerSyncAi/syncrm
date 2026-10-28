import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Ionicons } from "../../ui";
import { colors, radius, space } from "../../../lib/theme";
import { useRun } from "../../../lib/useRun";
import { pickAndUpload, type PhotoItem } from "../../../lib/stay-ops/photos";

/** Tap a photo to see it full screen. */
function Viewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewer} onPress={onClose}>
        {url ? <Image source={{ uri: url }} style={{ width: "100%", height: "80%" }} resizeMode="contain" /> : null}
      </Pressable>
    </Modal>
  );
}

/** Photos with add and remove. Uploads go to storage straight away. */
export function PhotoStrip({
  photos,
  onChange,
  max = 6,
  readOnly = false,
}: {
  photos: PhotoItem[];
  onChange?: (next: PhotoItem[]) => void;
  max?: number;
  readOnly?: boolean;
}) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { busy, run } = useRun();
  const [view, setView] = useState<string | null>(null);

  const add = () =>
    run(async () => {
      const p = await pickAndUpload(() => generateUploadUrl({}));
      if (p) onChange?.([...photos, p]);
    });

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {photos.map((p, i) => (
          <View key={p.storageId}>
            <Pressable onPress={() => p.url && setView(p.url)}>
              <Image source={{ uri: p.url }} style={styles.thumb} />
            </Pressable>
            {!readOnly && (
              <Pressable
                accessibilityLabel="Remove photo"
                hitSlop={8}
                onPress={() => onChange?.(photos.filter((_, j) => j !== i))}
                style={styles.remove}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            )}
          </View>
        ))}
        {!readOnly && photos.length < max && (
          <Pressable onPress={add} disabled={busy} style={[styles.thumb, styles.add, busy && { opacity: 0.5 }]}>
            <Ionicons name="camera-outline" size={22} color={colors.brand} />
            <Text style={styles.addText}>{busy ? "Uploading" : "Add"}</Text>
          </Pressable>
        )}
        {readOnly && photos.length === 0 && <Text style={styles.addText}>No photos</Text>}
      </ScrollView>
      <Viewer url={view} onClose={() => setView(null)} />
    </View>
  );
}

/** Read-only photos from URLs, e.g. in a completed report. */
export function PhotoGallery({ urls }: { urls: string[] }) {
  return <PhotoStrip readOnly photos={urls.map((url, i) => ({ storageId: `${i}-${url}`, url }))} />;
}

const styles = StyleSheet.create({
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surface },
  add: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", gap: 2 },
  addText: { fontSize: 12, color: colors.muted },
  remove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
});
