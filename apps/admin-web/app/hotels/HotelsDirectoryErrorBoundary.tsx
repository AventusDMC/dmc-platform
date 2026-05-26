'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

// Hotels Directory freeze fix — class-based error boundary scoped to
// the Hotels page tab content. Mirrors ContractTabErrorBoundary (PR
// #118) and RoomCategoriesErrorBoundary (PR #120): catches render
// errors so a malformed payload or downstream bug never freezes the
// whole hotels workspace.

type Props = {
  tabLabel: string;
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class HotelsDirectoryErrorBoundary extends Component<Props, State> {
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
    console.error('[hotels-directory-error-boundary] caught error', {
      tab: this.props.tabLabel,
      message: error?.message,
      stack: errorInfo?.componentStack,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="detail-card" role="alert">
        <p className="eyebrow">Hotels tab error</p>
        <h2>{this.props.tabLabel} could not render</h2>
        <p className="detail-copy">
          We caught an error before it could freeze the page. Retry the tab — if the issue
          persists, switch to a different tab or reload the workspace.
        </p>
        <button type="button" className="compact-button" onClick={this.handleReset}>
          Retry tab
        </button>
        <p className="form-error" style={{ marginTop: '0.75rem' }}>
          {this.state.message}
        </p>
      </section>
    );
  }
}
