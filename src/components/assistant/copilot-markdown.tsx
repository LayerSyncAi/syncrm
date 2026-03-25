import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const markdownComponents: Components = {
  table({ children }) {
    return (
      <div className="my-3 w-full overflow-x-auto rounded-[10px] border border-border-strong bg-card-bg shadow-sm">
        <table className="w-full min-w-[280px] border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="border-b border-[rgba(148,163,184,0.2)]">{children}</thead>
    );
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-[rgba(148,163,184,0.1)]">{children}</tbody>;
  },
  tr({ children }) {
    return (
      <tr className="transition-colors hover:bg-row-hover/80">{children}</tr>
    );
  },
  th({ children }) {
    return (
      <th
        className={cn(
          "whitespace-nowrap bg-[rgba(148,163,184,0.08)] px-3 py-2.5 text-left align-bottom",
          "text-[11px] font-semibold uppercase tracking-wide text-text-muted"
        )}
      >
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="max-w-[220px] px-3 py-2 align-top text-text wrap-break-word hyphens-auto">
        {children}
      </td>
    );
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed text-text">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-2 list-disc space-y-1 pl-5 text-text last:mb-0">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-2 list-decimal space-y-1 pl-5 text-text last:mb-0">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  strong({ children }) {
    return <strong className="font-semibold text-text">{children}</strong>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        className="font-medium text-primary-600 underline decoration-primary-600/40 underline-offset-2 hover:decoration-primary-600"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  code({ className, children, ...props }) {
    const inline = !className;
    if (inline) {
      return (
        <code
          className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-text"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn(
          "block overflow-x-auto rounded-[10px] border border-border-strong bg-black/20 p-3 font-mono text-[0.85em] text-text",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <pre className="my-2 overflow-x-auto">{children}</pre>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-primary-600/50 pl-3 text-text-muted italic">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-4 border-border-strong" />;
  },
};

export function CopilotMarkdown({ children }: { children: string }) {
  return (
    <div className="copilot-md max-w-none text-sm leading-relaxed text-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
