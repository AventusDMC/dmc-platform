'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

// Room Types freeze fix — class-based error boundary scoped to a single
// tab in the hotel contract workspace. If the Room Types / Rates /
// Supplements / Terms tab throws during render (oversized payload,
// missing nested field, etc.), this boundary catches the error and
// shows a friendly message instead of letting the whole page crash.
//
// Why a class component? React's error boundaries still require the
// class-based lifecycle hooks — there is no functional equivalent for
// componentDidCatch / getDerivedStateFromError as of React 18.

type Props = {
  tabLabel: string;
  children: ReactNode;
  onReset?: () => void;
};

type State = {
  hasError: boolean;
  message: string;
};

export class ContractTabErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Something went wrong while rendering this tab.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Console-only — we don't ship a telemetry pipeline yet. Render
    // diagnostics for the developer; users see the friendly fallback.
    console.error('[contract-tab-error-boundary] caught error', {
      tab: this.props.tabLabel,
      message: error?.message,
      stack: errorInfo?.componentStack,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="contract-workspace-card" role="alert">
        <div className="section-header-inline">
          <div>
            <p className="eyebrow">Tab error</p>
            <h3>{this.props.tabLabel} could not render</h3>
            <p>
              We caught an error before it could freeze the page. Try reloading the tab — if the
              problem persists, the contract may be missing data the workspace expects.
            </p>
          </div>
          <button type="button" className="compact-button" onClick={this.handleReset}>
            Retry tab
          </button>
        </div>
        <p className="form-error" style={{ marginTop: '0.75rem' }}>
          {this.state.message}
        </p>
      </section>
    );
  }
}
