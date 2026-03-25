"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import {
  Expand,
  Globe,
  MessageCircle,
  Minimize2,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CopilotMarkdown } from "@/components/assistant/copilot-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";

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

/* ─── Friendly tool-name labels for the thinking indicator ─── */
const TOOL_LABELS: Record<string, string> = {
  getDashboardSummary: "Pulling dashboard stats",
  searchLeads: "Searching leads",
  getLeadDetails: "Loading lead details",
  listUpcomingTasks: "Checking upcoming tasks",
  listPipelineStages: "Looking up pipeline stages",
  moveLeadStage: "Moving lead to new stage",
  updateLeadNotes: "Updating lead notes",
};

const THINKING_MESSAGES = [
  "Pondering",
  "Spelunking through your data",
  "Tinkering",
  "Mulling it over",
  "Rummaging around",
  "Noodling on this",
  "Digging in",
  "Percolating",
  "Chewing on that",
  "Connecting the dots",
  "Sifting through the details",
  "Piecing things together",
  "Brewing up an answer",
  "Crunching the numbers",
  "Poking around",
  "Deliberating",
];

/* ─── Thinking / status indicator component ─── */
function ThinkingIndicator({
  status,
  messages,
}: {
  status: string;
  messages: UIMessage[];
}) {
  const [thinkingIdx, setThinkingIdx] = useState(() =>
    Math.floor(Math.random() * THINKING_MESSAGES.length)
  );

  // Cycle through generic thinking messages with some randomness
  useEffect(() => {
    if (status !== "submitted" && status !== "streaming") return;
    // Reset to a random starting point each time we start thinking
    setThinkingIdx(Math.floor(Math.random() * THINKING_MESSAGES.length));
    const interval = setInterval(() => {
      setThinkingIdx((i) => {
        let next = i + 1 + Math.floor(Math.random() * 2);
        return next % THINKING_MESSAGES.length;
      });
    }, 2200);
    return () => clearInterval(interval);
  }, [status]);

  if (status !== "submitted" && status !== "streaming") return null;

  // Find active tool calls from the last assistant message
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const activeTools =
    lastAssistant?.parts
      .filter((p) => isToolUIPart(p))
      .map((p) => {
        const name = getToolName(p);
        const state = "state" in p && typeof p.state === "string" ? p.state : "";
        return { name, state };
      }) ?? [];

  // Determine label: prefer active tool label, otherwise generic thinking
  const runningTool = activeTools.find((t) => t.state !== "result");
  const completedTools = activeTools.filter((t) => t.state === "result");
  const label = runningTool
    ? TOOL_LABELS[runningTool.name] || `Running ${runningTool.name}`
    : THINKING_MESSAGES[thinkingIdx];

  return (
    <div className="flex items-start gap-2 self-start">
      <div className="flex flex-col gap-1.5 rounded-[10px] bg-card-bg px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-600 animate-[pulse_1.4s_ease-in-out_infinite]" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary-600 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary-600 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
          </div>
          <AnimatePresence mode="wait">
            <motion.span
              key={label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-xs font-medium text-text-muted"
            >
              {label}...
            </motion.span>
          </AnimatePresence>
        </div>
        {completedTools.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {completedTools.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md bg-primary-600/10 px-1.5 py-0.5 text-[10px] font-medium text-primary-600"
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {TOOL_LABELS[t.name] || t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function renderPart(part: UIMessage["parts"][number], index: number) {
  if (isTextUIPart(part)) {
    return <CopilotMarkdown key={index}>{part.text}</CopilotMarkdown>;
  }
  // Tool parts are now shown via ThinkingIndicator instead
  return null;
}

export const CopilotPanel = () => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string>(() => newChatId());
  const [chats, setChats] = useState<CopilotChat[]>([]);
  const [pendingRestore, setPendingRestore] = useState<UIMessage[] | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const persistedSignaturesRef = useRef<Record<string, string>>({});
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 44,
    maxHeight: 160,
  });

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

  // Auto-scroll to newest message / thinking indicator while panel is open.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [open, messages, status]);

  const onSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = draft.trim();
      if (!text || busy) return;
      const prefix = searchMode ? "Search my CRM: " : "";
      setDraft("");
      adjustHeight(true);
      await sendMessage({ text: prefix + text });
    },
    [draft, busy, sendMessage, searchMode, adjustHeight]
  );

  const startNewChat = useCallback(() => {
    if (busy) return;
    const id = newChatId();
    setActiveChatId(id);
    setPendingRestore([]);
    setMessages([]);
    setDraft("");
    adjustHeight(true);
  }, [busy, setMessages, adjustHeight]);

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
      setPendingRestore(found.messages ?? []);
      setDraft("");
    },
    [busy, chats]
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      if (busy) return;
      setChats((prev) => {
        const next = prev.filter((c) => c.id !== chatId);
        delete persistedSignaturesRef.current[chatId];
        saveChats(next);
        return next;
      });
      // If deleting the active chat, start fresh
      if (chatId === activeChatId) {
        const id = newChatId();
        setActiveChatId(id);
        setPendingRestore([]);
        setMessages([]);
        setDraft("");
      }
    },
    [busy, activeChatId, setMessages]
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

  const handleContainerClick = () => {
    textareaRef.current?.focus();
  };

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
                        <div
                          key={c.id}
                          className="group relative"
                        >
                          <button
                            type="button"
                            className={cn(
                              "w-full rounded-[10px] px-2 py-2 pr-8 text-left text-xs transition-colors",
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
                          <button
                            type="button"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-dim opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChat(c.id);
                            }}
                            disabled={busy}
                            aria-label={`Delete chat: ${c.title}`}
                            title="Delete chat"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
                        properties, tasks, and pipeline stages. For live numbers, I&apos;ll fetch your CRM data.
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
                          onClick={() => {
                            setSearchMode(true);
                            setDraft("");
                            setTimeout(() => textareaRef.current?.focus(), 50);
                          }}
                        >
                          <Search className="mr-1 h-3 w-3" />
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
                  <ThinkingIndicator status={status} messages={messages as UIMessage[]} />
                  <div ref={scrollAnchorRef} />
                </div>
                {error && (
                  <p className="text-xs text-danger">
                    {error.message || "Something went wrong."}
                  </p>
                )}

                {/* ─── Search-style input area ─── */}
                <div
                  role="textbox"
                  tabIndex={0}
                  aria-label="Chat input"
                  className={cn(
                    "relative flex flex-col rounded-[10px] transition-all duration-200 w-full text-left cursor-text",
                    "ring-1 ring-border-strong",
                    isFocused && "ring-primary-600/50"
                  )}
                  onClick={handleContainerClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleContainerClick();
                    }
                  }}
                >
                  <div className="overflow-y-auto max-h-[160px]">
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      placeholder={searchMode ? "Search your CRM data..." : "Message..."}
                      className="w-full rounded-[10px] rounded-b-none bg-content-bg/60 px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-dim resize-none leading-[1.4] border-none focus:ring-0"
                      disabled={busy}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void onSubmit();
                        }
                      }}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        adjustHeight();
                      }}
                    />
                  </div>
                  <div className="h-10 bg-content-bg/40 rounded-b-[10px] flex items-center justify-between px-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSearchMode((v) => !v)}
                        className={cn(
                          "rounded-full transition-all flex items-center gap-1.5 px-1.5 py-1 border h-7 cursor-pointer text-xs",
                          searchMode
                            ? "bg-primary-600/15 border-primary-600/50 text-primary-600"
                            : "bg-white/5 border-transparent text-text-dim hover:text-text-muted"
                        )}
                      >
                        <motion.div
                          animate={{
                            rotate: searchMode ? 360 : 0,
                            scale: searchMode ? 1.1 : 1,
                          }}
                          whileHover={{
                            scale: 1.15,
                            transition: { type: "spring", stiffness: 300, damping: 10 },
                          }}
                          transition={{ type: "spring", stiffness: 260, damping: 25 }}
                          className="flex items-center justify-center"
                        >
                          <Globe
                            className={cn(
                              "h-3.5 w-3.5",
                              searchMode ? "text-primary-600" : "text-inherit"
                            )}
                          />
                        </motion.div>
                        <AnimatePresence>
                          {searchMode && (
                            <motion.span
                              initial={{ width: 0, opacity: 0 }}
                              animate={{ width: "auto", opacity: 1 }}
                              exit={{ width: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden whitespace-nowrap text-primary-600 shrink-0"
                            >
                              Search
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {busy && (
                        <button
                          type="button"
                          onClick={() => stop()}
                          className="rounded-lg p-1.5 bg-white/5 text-text-dim hover:text-text-muted transition-colors"
                          title="Stop generating"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void onSubmit()}
                        disabled={busy || !draft.trim()}
                        className={cn(
                          "rounded-lg p-1.5 transition-colors",
                          draft.trim()
                            ? "bg-primary-600/15 text-primary-600 hover:bg-primary-600/25"
                            : "bg-white/5 text-text-dim cursor-default"
                        )}
                        title="Send message"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};
