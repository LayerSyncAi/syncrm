import { useCallback, useRef } from "react";

export function useAutoResizeTextarea({
  minHeight = 52,
  maxHeight = 200,
}: {
  minHeight?: number;
  maxHeight?: number;
} = {}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const el = textareaRef.current;
      if (!el) return;
      if (reset) {
        el.style.height = `${minHeight}px`;
        return;
      }
      el.style.height = `${minHeight}px`;
      const scrollH = el.scrollHeight;
      el.style.height = `${Math.min(Math.max(scrollH, minHeight), maxHeight)}px`;
    },
    [minHeight, maxHeight]
  );

  return { textareaRef, adjustHeight };
}
