import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../UI/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render errors so a single crash does not blank the whole SPA.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, info.componentStack);
    }
    if (import.meta.env.VITE_SENTRY_DSN) {
      import('@sentry/react')
        .then((Sentry) => {
          Sentry.captureException(error, {
            extra: { componentStack: info.componentStack },
          });
        })
        .catch(() => {});
    }
  }

  private handleReload = () => {
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Une erreur est survenue
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              L&apos;application a rencontré un problème inattendu. Rechargez la page pour continuer.
            </p>
            <Button onClick={this.handleReload} className="mx-auto">
              Recharger
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
