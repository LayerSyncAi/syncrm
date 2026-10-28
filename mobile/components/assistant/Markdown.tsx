/**
 * A small markdown renderer for assistant replies: headings, bullet and
 * numbered lists, code blocks, bold, italic and inline code. Anything else
 * shows as plain text.
 */
import { Fragment, type ReactNode } from "react";
import { Text, View } from "react-native";
import { colors, font, space } from "../../lib/theme";

function inline(text: string, keyBase: string): ReactNode[] {
  // Bold, italic and code spans, in that order of precedence.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <Text key={key} style={{ fontWeight: "700" }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <Text key={key} style={{ fontFamily: "Menlo", backgroundColor: colors.surface, fontSize: font.sm }}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <Text key={key} style={{ fontStyle: "italic" }}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function Markdown({ children }: { children: string }) {
  const lines = children.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let code: string[] | null = null;

  lines.forEach((raw, i) => {
    const key = `l${i}`;
    if (raw.trim().startsWith("```")) {
      if (code) {
        blocks.push(
          <View key={key} style={{ backgroundColor: colors.surface, borderRadius: 6, padding: space.sm }}>
            <Text style={{ fontFamily: "Menlo", fontSize: font.sm, color: colors.text }}>{code.join("\n")}</Text>
          </View>
        );
        code = null;
      } else {
        code = [];
      }
      return;
    }
    if (code) {
      code.push(raw);
      return;
    }
    const line = raw.trimEnd();
    if (!line.trim()) return;

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <Text key={key} style={{ fontSize: heading[1].length <= 2 ? font.lg : font.md, fontWeight: "700", color: colors.text, marginTop: space.xs }}>
          {inline(heading[2], key)}
        </Text>
      );
      return;
    }
    const bullet = /^(\s*)[-*•]\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const indent = ((bullet?.[1] ?? numbered?.[1] ?? "").length >= 2 ? 1 : 0) * space.lg;
      const marker = bullet ? "•" : `${numbered![2]}.`;
      const body = bullet ? bullet[2] : numbered![3];
      blocks.push(
        <View key={key} style={{ flexDirection: "row", gap: space.sm, paddingLeft: indent }}>
          <Text style={{ fontSize: font.md, color: colors.muted, minWidth: 16 }}>{marker}</Text>
          <Text style={{ flex: 1, fontSize: font.md, lineHeight: 21, color: colors.text }}>{inline(body, key)}</Text>
        </View>
      );
      return;
    }
    blocks.push(
      <Text key={key} style={{ fontSize: font.md, lineHeight: 21, color: colors.text }}>
        {inline(line, key)}
      </Text>
    );
  });

  return <View style={{ gap: space.xs }}>{blocks}</View>;
}
