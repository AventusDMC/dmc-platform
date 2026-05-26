'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

// Hotel Master Room Categories freeze fix — class-based error boundary
// scoped to the Room Categories tab. Mirrors ContractTabErrorBoundary
// from PR #118: catches render errors so a malformed summary payload
// (or a downstream bug in RoomCategoriesManager) never freezes the
// whole Hotels workspace.

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class RoomCategoriesErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Something went wrong while rendering Room Categories.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[room-categories-error-boundary] caught error', {
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
        <p className="eyebrow">Room Categories error</p>
        <h2>Room Categories could not render</h2>
        <p className="detail-copy">
          We caught an error before it could freeze the page. Reload the tab to retry — if the
          problem persists, the underlying data may be malformed.
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
