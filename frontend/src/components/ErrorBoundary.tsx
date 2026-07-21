import { Component, type ReactNode } from "react";

type Props = {
  fallback?: ReactNode;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[coach] Unhandled UI error", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center px-6">
            <div className="rounded-full border border-red-800 bg-red-950/60 p-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="text-sm text-slate-400 max-w-sm">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-2xl bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-500 active:scale-95 transition-all"
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
