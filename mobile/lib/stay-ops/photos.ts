import { useCallback, useState } from "react";
import { choosePhoto, uploadFile } from "../files";

/** A photo held as a Convex storage id, with a URL to show it (a local file until the server URL loads). */
export type PhotoItem = { storageId: string; url: string };

/** Pick a photo and upload it. Null when the user cancels. */
export async function pickAndUpload(getUploadUrl: () => Promise<string>): Promise<PhotoItem | null> {
  const file = await choosePhoto();
  if (!file) return null;
  const storageId = await uploadFile(getUploadUrl, file);
  return { storageId, url: file.uri };
}

/** Pair storage ids with their URLs, as the queries return them. */
export function toPhotoItems(ids: string[], urls: string[]): PhotoItem[] {
  return ids.map((storageId, i) => ({ storageId, url: urls[i] ?? "" }));
}

/** Lists are live, so pull-to-refresh only shows the spinner briefly. */
export function useQuickRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);
  return { refreshing, onRefresh };
}
