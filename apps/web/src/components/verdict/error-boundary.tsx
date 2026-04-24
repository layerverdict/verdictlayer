"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort client-side error boundary. For page-level errors prefer
 * Next.js `error.tsx` route files; this wraps standalone components like
 * ReasoningStream so a malformed SSE frame doesn't crash the whole page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In dev, surface the trace in the browser console. Production can
    // forward to Sentry once it's wired.
    // eslint-disable-next-line no-console
    console.error("verdict: error boundary caught", error, info);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Card className="border-danger/40">
          <CardHeader>
            <CardTitle className="text-danger">Something broke</CardTitle>
            <CardDescription>
              {this.state.error.message || "An unexpected error occurred."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
