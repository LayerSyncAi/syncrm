/**
 * Property photos: a grid with add (camera, library or a web link), remove
 * and "make cover". Uploads go through api.storage.generateUploadUrl and are
 * stored as their public URL, exactly as the website's ImageUpload does.
 */
import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button, Field, Ionicons, Row } from "../../../ui";
import { choosePhoto, uploadFile } from "../../../../lib/files";
import { useRun } from "../../../../lib/useRun";
import { colors, font, radius, space } from "../../../../lib/theme";

const MAX = 25;

export function PhotoEditor({
  images,
  onChange,
  disabled = false,
  error,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { busy, run } = useRun();
  const [link, setLink] = useState("");
  const [view, setView] = useState<string | null>(null);

  const add = () =>
    run(async () => {
      const file = await choosePhoto();
      if (!file) return;
      const storageId = await uploadFile(() => generateUploadUrl({}), file);
      const url = await convex.query(api.storage.getUrl, { storageId: storageId as Id<"_storage"> });
      if (!url) throw new Error("The photo uploaded but its link could not be read. Try again.");
      onChange([...images, url]);
    });

  const addLink = () => {
    const url = link.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return;
    if (images.includes(url)) return;
    onChange([...images, url]);
    setLink("");
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.grid}>
        {images.map((url, i) => (
          <View key={`${i}-${url}`} style={styles.cell}>
            <Pressable onPress={() => setView(url)}>
              <Image source={{ uri: url }} style={styles.thumb} />
            </Pressable>
            {i === 0 && (
              <View style={styles.cover}>
                <Text style={styles.coverText}>Cover</Text>
              </View>
            )}
            {!disabled && (
              <View style={styles.actions}>
                {i > 0 && (
                  <Pressable
                    accessibilityLabel="Make cover photo"
                    hitSlop={6}
                    onPress={() => onChange([url, ...images.filter((_, j) => j !== i)])}
                    style={styles.action}
                  >
                    <Ionicons name="star-outline" size={14} color="#fff" />
                  </Pressable>
                )}
                <Pressable accessibilityLabel="Remove photo" hitSlop={6} onPress={() => onChange(images.filter((_, j) => j !== i))} style={styles.action}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            )}
          </View>
        ))}
        {!disabled && images.length < MAX && (
          <Pressable onPress={add} disabled={busy} style={[styles.cell, styles.thumb, styles.add, busy && { opacity: 0.5 }]}>
            <Ionicons name="camera-outline" size={24} color={colors.brand} />
            <Text style={styles.addText}>{busy ? "Uploading" : "Add photo"}</Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.hint, error ? { color: colors.danger } : null]}>{error ?? `${images.length} of ${MAX} photos. At least 2 are required.`}</Text>
      {!disabled && images.length < MAX && (
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Or add a photo link" value={link} onChangeText={setLink} placeholder="https://" autoCapitalize="none" keyboardType="url" />
          </View>
          <Button small variant="secondary" title="Add" onPress={addLink} disabled={!link.trim()} style={{ marginTop: 22 }} />
        </Row>
      )}
      <Modal visible={!!view} transparent animationType="fade" onRequestClose={() => setView(null)}>
        <Pressable style={styles.viewer} onPress={() => setView(null)}>
          {view ? <Image source={{ uri: view }} style={{ width: "100%", height: "80%" }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { width: "31%" },
  thumb: { width: "100%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surface },
  add: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, gap: 4 },
  addText: { fontSize: font.xs, color: colors.muted, fontWeight: "600" },
  hint: { fontSize: font.xs, color: colors.muted },
  cover: { position: "absolute", left: 4, bottom: 4, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  coverText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  actions: { position: "absolute", top: 4, right: 4, flexDirection: "row", gap: 4 },
  action: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(15,23,42,0.65)", alignItems: "center", justifyContent: "center" },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
});

/** Read-only photos: a swipeable strip with a full-screen viewer. */
export function PhotoGallery({ images }: { images: string[] }) {
  const [view, setView] = useState<string | null>(null);
  if (images.length === 0) return <Text style={styles.hint}>No photos yet.</Text>;
  return (
    <View style={styles.grid}>
      {images.map((url, i) => (
        <Pressable key={`${i}-${url}`} style={styles.cell} onPress={() => setView(url)}>
          <Image source={{ uri: url }} style={styles.thumb} />
        </Pressable>
      ))}
      <Modal visible={!!view} transparent animationType="fade" onRequestClose={() => setView(null)}>
        <Pressable style={styles.viewer} onPress={() => setView(null)}>
          {view ? <Image source={{ uri: view }} style={{ width: "100%", height: "80%" }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}
