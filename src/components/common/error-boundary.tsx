"use client";

import React, { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  /** Label shown in the fallback UI to identify which section failed */
  sectionName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary that catches render errors in child components.
 * Displays a fallback UI instead of crashing the entire page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.sectionName ? `: ${this.props.sectionName}` : ""}]`,
      error,
      errorInfo.componentStack
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-border-strong bg-surface-2/50 p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10">
            <svg className="h-5 w-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-text">
              {this.props.sectionName
                ? `Something went wrong in ${this.props.sectionName}`
                : "Something went wrong"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Try refreshing the page. If the problem persists, contact support.
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 rounded-lg bg-border px-4 py-2 text-xs font-medium text-text transition-colors hover:bg-border-strong"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
