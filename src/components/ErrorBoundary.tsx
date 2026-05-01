import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-base flex items-center justify-center p-6">
          <div className="max-w-md w-full sharp-card p-10 border-t-8 border-primary bg-bg-surface shadow-2xl text-center">
            <div className="flex justify-center text-primary mb-6">
              <AlertTriangle size={64} />
            </div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-4">
              SYSTEM <span className="text-primary not-italic">FAILURE</span>
            </h2>
            <p className="text-text-muted mb-8 font-medium">
              An unexpected error occurred in core modules. The application has been halted to prevent data corruption.
            </p>
            <div className="bg-hot-black/50 p-4 border border-border-subtle rounded mb-8 text-left overflow-auto max-h-32">
              <code className="text-[10px] font-mono text-red-400">
                {this.state.error?.message || "Unknown error"}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-primary text-white font-black uppercase text-xs tracking-[0.3em] italic flex items-center justify-center gap-2 hover:bg-red-700 transition-all shadow-xl shadow-primary/20"
            >
              <RefreshCw size={16} /> Re-initialize System
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
