/**
 * The Copilot chat. History lives in the same copilotChats table the website
 * uses, so a conversation started on either shows on both. Replies come from
 * the website's /api/chat route, authenticated with the Convex token.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Body, Button, EmptyState, Ionicons, ListItem, Notice, Sheet } from "../components/ui";
import { Markdown } from "../components/assistant/Markdown";
import { messageText, newChatId, streamReply, type ChatMessage } from "../lib/assistant/stream";
import { confirm } from "../lib/useRun";
import { timeAgo } from "../lib/format";
import { getErrorMessage } from "@/lib/errors";
import { colors, font, radius, space } from "../lib/theme";

const MAX_MESSAGES = 80;
const SUGGESTIONS = ["Give me a summary of my pipeline", "Which tasks are due soon?", "Find leads I have not contacted this week"];

function titleOf(messages: ChatMessage[]) {
  const first = messages.find((m) => m.role === "user");
  const raw = (first ? messageText(first) : "New chat").replace(/\s+/g, " ").trim();
  return raw.length > 42 ? `${raw.slice(0, 42)}…` : raw || "New chat";
}

/** Stored history may carry extra fields or parts; keep what the route needs. */
function fromStored(stored: unknown[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of stored as Array<{ id?: string; role?: string; parts?: Array<{ type?: string; text?: string }> }>) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const parts = (m.parts ?? []).filter((p) => p.type === "text" && typeof p.text === "string").map((p) => ({ type: "text" as const, text: p.text as string }));
    if (parts.length === 0) continue;
    out.push({ id: m.id ?? newChatId(), role: m.role, parts });
  }
  return out;
}

export default function Assistant() {
  const token = useAuthToken();
  const chats = useQuery(api.copilotChats.listMine);
  const upsert = useMutation(api.copilotChats.upsert);
  const removeChat = useMutation(api.copilotChats.remove);
  const clearAll = useMutation(api.copilotChats.clearAll);

  const [chatId, setChatId] = useState(newChatId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const scrollEnd = () => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || busy) return;
      if (!token) {
        setError("You are signed out. Sign in again to use the assistant.");
        return;
      }
      setError(null);
      setDraft("");
      const userMsg: ChatMessage = { id: newChatId(), role: "user", parts: [{ type: "text", text: body }] };
      const replyId = newChatId();
      const history = [...messages, userMsg];
      setMessages([...history, { id: replyId, role: "assistant", parts: [{ type: "text", text: "" }] }]);
      setBusy(true);
      scrollEnd();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const reply = await streamReply({
          token,
          chatId,
          messages: history,
          signal: controller.signal,
          onStatus: setStatus,
          onText: (t) => {
            setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, parts: [{ type: "text", text: t }] } : m)));
            scrollEnd();
          },
        });
        const finished: ChatMessage[] = [...history, { id: replyId, role: "assistant", parts: [{ type: "text", text: reply }] }];
        setMessages(finished);
        // Saved once per exchange, like the website: only text, last 80 messages.
        void upsert({
          chatId,
          title: titleOf(finished),
          messages: finished.slice(-MAX_MESSAGES).map((m) => ({ ...m, createdAt: new Date().toISOString() })),
          updatedAt: Date.now(),
        });
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(e));
          // Drop the empty reply so the failed question can be sent again.
          setMessages((prev) => prev.filter((m) => m.id !== replyId));
          setDraft(body);
        }
      } finally {
        setBusy(false);
        setStatus("");
      }
    },
    [busy, token, messages, chatId, upsert]
  );

  function stop() {
    abort.current?.abort();
    setBusy(false);
    setStatus("");
  }

  function startNew() {
    if (busy) return;
    setChatId(newChatId());
    setMessages([]);
    setError(null);
    setDraft("");
  }

  function openChat(id: string) {
    const found = chats?.find((c) => c.chatId === id);
    if (!found || busy) return;
    setChatId(found.chatId);
    setMessages(fromStored(found.messages ?? []));
    setError(null);
    setHistoryOpen(false);
    scrollEnd();
  }

  async function deleteChat(id: string) {
    await removeChat({ chatId: id });
    if (id === chatId) startNew();
  }

  async function clearHistory() {
    if (!(await confirm("Clear history", "Delete every saved conversation? This cannot be undone.", "Clear", true))) return;
    await clearAll();
    startNew();
    setHistoryOpen(false);
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: "Copilot",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: space.lg, paddingRight: 4 }}>
              <Pressable onPress={startNew} accessibilityLabel="New chat" hitSlop={10}>
                <Ionicons name="create-outline" size={23} color={colors.brand} />
              </Pressable>
              <Pressable onPress={() => setHistoryOpen(true)} accessibilityLabel="History" hitSlop={10}>
                <Ionicons name="time-outline" size={23} color={colors.brand} />
              </Pressable>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={{ gap: space.md }}>
              <EmptyState icon="sparkles-outline" title="Ask about your pipeline" message="The Copilot can look up leads, tasks and stages, and explain how the app works." />
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={{ borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: space.md, backgroundColor: colors.card }}>
                  <Text style={{ color: colors.text, fontSize: font.md }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          }
          renderItem={({ item, index }) => {
            const mine = item.role === "user";
            const text = messageText(item);
            const waiting = busy && !mine && index === messages.length - 1 && !text;
            return (
              <View
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  maxWidth: mine ? "88%" : "96%",
                  backgroundColor: mine ? colors.brandLight : colors.card,
                  borderWidth: mine ? 0 : 1,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                  padding: space.md,
                  gap: 4,
                }}
              >
                <Text style={{ fontSize: font.xs, fontWeight: "700", color: colors.muted, textTransform: "uppercase" }}>{mine ? "You" : "Copilot"}</Text>
                {waiting ? <Body muted>{status ? `${status}...` : "Thinking..."}</Body> : mine ? <Text style={{ fontSize: font.md, color: colors.text, lineHeight: 21 }}>{text}</Text> : <Markdown>{text}</Markdown>}
                {!mine && !waiting && busy && index === messages.length - 1 && status ? <Body small muted>{status}...</Body> : null}
              </View>
            );
          }}
          ListFooterComponent={error ? <Notice tone="danger">{error}</Notice> : undefined}
        />
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask the Copilot"
            placeholderTextColor={colors.faint}
            multiline
            style={{ flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingTop: 12, paddingBottom: 12, fontSize: font.md, color: colors.text }}
          />
          {busy ? (
            <Pressable onPress={stop} accessibilityLabel="Stop" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="stop" size={20} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => send(draft)}
              disabled={!draft.trim()}
              accessibilityLabel="Send"
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: draft.trim() ? colors.brand : colors.borderStrong, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="arrow-up" size={22} color="#fff" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="History" footer={chats && chats.length > 0 ? <Button title="Clear all history" variant="danger" onPress={clearHistory} /> : undefined}>
        {chats === undefined ? <Body muted>Loading</Body> : null}
        {chats?.length === 0 ? <Body muted>No saved conversations yet.</Body> : null}
        {chats?.map((c) => (
          <View key={c.chatId} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <ListItem title={c.title} subtitle={timeAgo(c.updatedAt)} onPress={() => openChat(c.chatId)} />
            </View>
            <Pressable onPress={() => deleteChat(c.chatId)} accessibilityLabel="Delete conversation" hitSlop={10}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
        ))}
      </Sheet>
    </SafeAreaView>
  );
}
