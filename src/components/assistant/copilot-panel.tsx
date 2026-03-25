"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { Expand, MessageCircle, Minimize2, Plus, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopilotMarkdown } from "@/components/assistant/copilot-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const copilotTransport = new DefaultChatTransport({
  api: "/api/chat",
  credentials: "include",
});

type CopilotChat = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

const STORAGE_KEY = "syncrm.copilot.chats.v1";
const MAX_CHATS = 20;
const MAX_MESSAGES_PER_CHAT = 80;

function safeNow() {
  return Date.now();
}

function newChatId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `chat_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function inferTitle(messages: UIMessage[]) {
  const firstUser = messages.find((m) => m.role === "user");
  const firstTextPart = firstUser?.parts.find((p) => isTextUIPart(p));
  const raw = firstTextPart && isTextUIPart(firstTextPart) ? firstTextPart.text : "New chat";
  const singleLine = raw.replace(/\s+/g, " ").trim();
  return singleLine.length > 42 ? singleLine.slice(0, 42) + "…" : singleLine || "New chat";
}

function loadChats(): CopilotChat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CopilotChat[];
  } catch {
    return [];
  }
}

function saveChats(chats: CopilotChat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // ignore quota / privacy mode
  }
}

function renderPart(part: UIMessage["parts"][number], index: number) {
  if (isTextUIPart(part)) {
    return (
      <CopilotMarkdown key={index}>{part.text}</CopilotMarkdown>
    );
  }
  if (isToolUIPart(part)) {
    const name = getToolName(part);
    const state =
      "state" in part && typeof part.state === "string" ? part.state : "";
    return (
      <p
        key={index}
        className="rounded-md border border-border-strong bg-row-hover/50 px-2 py-1 text-xs text-text-muted"
      >
        Tool: {name}
        {state ? ` · ${state}` : ""}
      </p>
    );
  }
  return null;
}

export const CopilotPanel = () => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string>(() => newChatId());
  const [chats, setChats] = useState<CopilotChat[]>([]);
  const [pendingRestore, setPendingRestore] = useState<UIMessage[] | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const persistedSignaturesRef = useRef<Record<string, string>>({});

  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    id: activeChatId,
    transport: copilotTransport,
  });

  const busy = status === "streaming" || status === "submitted";

  // Lock background scroll + allow Escape to close.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Load stored history once.
  useEffect(() => {
    const loaded = loadChats();
    setChats(loaded);
    persistedSignaturesRef.current = Object.fromEntries(
      loaded.map((chat) => [chat.id, JSON.stringify(chat.messages ?? [])])
    );
  }, []);

  // Persist current chat whenever messages change.
  useEffect(() => {
    const uiMessages = messages as UIMessage[];
    const trimmed = uiMessages.slice(-MAX_MESSAGES_PER_CHAT);
    const signature = JSON.stringify(trimmed);

    if (persistedSignaturesRef.current[activeChatId] === signature) {
      return;
    }

    setChats((prev) => {
      const next = [...prev];
      const idx = next.findIndex((c) => c.id === activeChatId);
      const existing = idx >= 0 ? next[idx] : undefined;
      const updatedAt =
        existing && JSON.stringify(existing.messages ?? []) === signature
          ? existing.updatedAt
          : safeNow();
      const nextChat: CopilotChat = {
        id: activeChatId,
        title: inferTitle(trimmed),
        updatedAt,
        messages: trimmed,
      };
      if (idx >= 0) next[idx] = nextChat;
      else next.unshift(nextChat);

      next.sort((a, b) => b.updatedAt - a.updatedAt);
      const capped = next.slice(0, MAX_CHATS);
      persistedSignaturesRef.current[activeChatId] = signature;
      saveChats(capped);
      return capped;
    });
  }, [activeChatId, messages]);

  // Auto-scroll to newest message while panel is open.
  useEffect(() => {
    if (!open) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text || busy) return;
      setDraft("");
      await sendMessage({ text });
    },
    [draft, busy, sendMessage]
  );

  const startNewChat = useCallback(() => {
    if (busy) return;
    const id = newChatId();
    setActiveChatId(id);
    setPendingRestore([]);
    setMessages([]);
    setDraft("");
  }, [busy, setMessages]);

  // Restore messages after switching chat id.
  useEffect(() => {
    if (pendingRestore === null) return;
    setMessages(pendingRestore);
    setPendingRestore(null);
  }, [activeChatId, pendingRestore, setMessages]);

  const openChat = useCallback(
    (chatId: string) => {
      if (busy) return;
      const found = chats.find((c) => c.id === chatId);
      if (!found) return;
      setActiveChatId(found.id);
      // setMessages must run after `useChat` has switched to the new id.
      setPendingRestore(found.messages ?? []);
      setDraft("");
    },
    [busy, chats, setMessages]
  );

  const clearHistory = useCallback(() => {
    if (busy) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    persistedSignaturesRef.current = {};
    setChats([]);
    // Keep current chat open, but start fresh.
    const id = newChatId();
    setActiveChatId(id);
    setPendingRestore([]);
    setMessages([]);
    setDraft("");
  }, [busy, setMessages]);

  const messageList = useMemo(
    () =>
      (messages as UIMessage[]).map((m) => (
        <div
          key={m.id}
          className={cn(
            "w-fit max-w-[92%] rounded-[10px] px-3 py-2",
            m.role === "user"
              ? "self-end bg-primary-600/15 text-text"
              : "self-start bg-card-bg text-text"
          )}
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {m.role === "user" ? "You" : "SynCRM Copilot"}
          </p>
          {m.parts.map((part, i) => renderPart(part, i))}
        </div>
      )),
    [messages]
  );

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg md:bottom-8 md:right-8"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] md:items-center md:p-8"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <Card
            className={cn(
              "flex max-h-[min(720px,calc(100vh-4rem))] w-full flex-col shadow-[0_20px_48px_rgba(0,0,0,0.35)]",
              expanded ? "max-w-4xl" : "max-w-md"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border-strong pb-3">
              <div>
                <h2 className="text-sm font-semibold text-text">SynCRM Copilot</h2>
                <p className="text-xs text-text-muted">
                  Ask about the app or your pipeline
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={startNewChat}
                  disabled={busy}
                  aria-label="New chat"
                  title="New chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((v) => !v)}
                  aria-label={expanded ? "Collapse" : "Expand"}
                  title={expanded ? "Collapse" : "Expand"}
                >
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 gap-3 p-4 pt-3">
              {expanded && (
                <div className="hidden w-[280px] shrink-0 flex-col gap-2 md:flex">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-text-muted">History</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || chats.length === 0}
                      onClick={clearHistory}
                      title="Clear history"
                      aria-label="Clear history"
                      className="h-7 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 overflow-y-auto rounded-[10px] border border-border-strong/80 bg-content-bg p-2">
                    {chats.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-text-muted">No chats yet.</p>
                    ) : (
                      chats.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={cn(
                            "w-full rounded-[10px] px-2 py-2 text-left text-xs transition-colors",
                            c.id === activeChatId
                              ? "bg-white/10 text-text"
                              : "hover:bg-white/5 text-text-muted"
                          )}
                          onClick={() => openChat(c.id)}
                          disabled={busy}
                        >
                          <div className="line-clamp-2">{c.title}</div>
                          <div className="mt-1 text-[10px] text-text-dim">
                            {new Date(c.updatedAt).toLocaleString()}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div
                  ref={scrollerRef}
                  className="flex min-h-[200px] flex-1 flex-col gap-2 overflow-y-auto rounded-[10px] border border-border-strong/80 bg-content-bg p-3"
                >
                  {messages.length === 0 && (
                    <div className="rounded-[12px] border border-border-strong bg-card-bg p-3">
                      <p className="text-sm font-semibold text-text">Welcome to SynCRM Copilot</p>
                      <p className="mt-1 text-sm text-text-muted">
                        I can explain SynCRM, answer quick questions, and help you work with leads, contacts,
                        properties, tasks, and pipeline stages. For live numbers, I’ll fetch your CRM data.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setDraft("Tell me about SynCRM")}
                        >
                          What is SynCRM?
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setDraft("Summarize my dashboard: totals, open/won/lost, and stage breakdown")}
                        >
                          Dashboard summary
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setDraft("Show my upcoming tasks in a table")}
                        >
                          Upcoming tasks
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setDraft("Search leads named Smith and show results as a table")}
                        >
                          Search leads
                        </Button>
                      </div>
                      <p className="mt-3 text-xs text-text-dim">
                        Tip: Press <span className="font-semibold text-text-muted">Enter</span> to send,{" "}
                        <span className="font-semibold text-text-muted">Shift+Enter</span> for a new line.
                      </p>
                    </div>
                  )}
                  {messageList}
                </div>
              {error && (
                <p className="text-xs text-danger">
                  {error.message || "Something went wrong."}
                </p>
              )}
              <form onSubmit={onSubmit} className="flex flex-col gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message…"
                  className="min-h-[80px] resize-none"
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSubmit(e);
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  {busy && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => stop()}
                    >
                      <Square className="mr-1 h-3 w-3" />
                      Stop
                    </Button>
                  )}
                  <Button type="submit" variant="primary" size="sm" disabled={busy}>
                    <Send className="mr-1 h-3 w-3" />
                    Send
                  </Button>
                </div>
              </form>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};
