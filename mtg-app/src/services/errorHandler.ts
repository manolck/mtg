/**
 * Gestion centralisée des erreurs
 * Logging et affichage utilisateur-friendly
 */

// Utilisation d'un objet const au lieu d'un enum pour compatibilité avec erasableSyntaxOnly
export const ErrorTypeValues = {
  NETWORK: 'NETWORK',
  API: 'API',
  VALIDATION: 'VALIDATION',
  AUTH: 'AUTH',
  FIRESTORE: 'FIRESTORE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorType = typeof ErrorTypeValues[keyof typeof ErrorTypeValues];

export interface AppError {
  type: ErrorType;
  message: string;
  originalError?: Error;
  code?: string;
  retryable?: boolean;
}

// Callback pour afficher les erreurs (sera défini par ToastProvider)
let toastErrorCallback: ((message: string) => void) | null = null;

export function setErrorToastCallback(callback: (message: string) => void) {
  toastErrorCallback = callback;
}

class ErrorHandler {
  private sentryEnabled = false;
  private sentryInitialized = false;

  /**
   * Initialise le handler d'erreurs
   */
  async init(sentryDsn?: string): Promise<void> {
    if (sentryDsn && typeof window !== 'undefined' && !this.sentryInitialized) {
      try {
        // Lazy load Sentry pour éviter de l'inclure dans le bundle si non utilisé
        const Sentry = await import('@sentry/react');
        
        Sentry.init({
          dsn: sentryDsn,
          environment: import.meta.env.MODE || 'development',
          // Performance monitoring optionnel (10% des transactions)
          integrations: [
            Sentry.browserTracingIntegration(),
          ],
          tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
          // Capture des erreurs non gérées
          beforeSend(event) {
            // Filtrer les erreurs de développement si nécessaire
            if (import.meta.env.DEV && event.exception) {
              console.log('Sentry would capture:', event);
            }
            return event;
          },
        });

        this.sentryEnabled = true;
        this.sentryInitialized = true;
      } catch (error) {
        console.warn('Failed to initialize Sentry:', error);
        this.sentryEnabled = false;
      }
    }
  }

  /**
   * Traite une erreur et retourne un AppError
   */
  handleError(error: unknown): AppError {
    const appError = this.normalizeError(error);

    // Logger l'erreur
    this.logError(appError);

    return appError;
  }

  /**
   * Normalise une erreur en AppError
   */
  private normalizeError(error: unknown): AppError {
    if (error instanceof Error) {
      // Erreur réseau
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return {
          type: ErrorTypeValues.NETWORK,
          message: 'Erreur de connexion. Vérifiez votre connexion internet.',
          originalError: error,
          retryable: true,
        };
      }

      // Erreur Firebase Auth
      if (error.message.includes('auth/')) {
        return {
          type: ErrorTypeValues.AUTH,
          message: this.getAuthErrorMessage(error.message),
          originalError: error,
          code: error.message,
        };
      }

      // Erreur Firestore
      if (error.message.includes('firestore') || error.message.includes('permission')) {
        return {
          type: ErrorTypeValues.FIRESTORE,
          message: 'Erreur d\'accès aux données. Vérifiez vos permissions.',
          originalError: error,
        };
      }

      // Erreur API
      if (error.message.includes('API') || error.message.includes('rate limit')) {
        return {
          type: ErrorTypeValues.API,
          message: 'Erreur API. Veuillez réessayer plus tard.',
          originalError: error,
          retryable: true,
        };
      }

      // Erreur générique
      return {
        type: ErrorTypeValues.UNKNOWN,
        message: error.message || 'Une erreur est survenue',
        originalError: error,
      };
    }

    // Erreur inconnue
    return {
      type: ErrorTypeValues.UNKNOWN,
      message: 'Une erreur inattendue est survenue',
    };
  }

  /**
   * Convertit un message d'erreur Firebase Auth en message utilisateur
   */
  private getAuthErrorMessage(errorCode: string): string {
    const messages: Record<string, string> = {
      'auth/user-not-found': 'Aucun compte trouvé avec cet email.',
      'auth/wrong-password': 'Mot de passe incorrect.',
      'auth/email-already-in-use': 'Cet email est déjà utilisé.',
      'auth/weak-password': 'Le mot de passe est trop faible.',
      'auth/invalid-email': 'Email invalide.',
      'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
    };

    return messages[errorCode] || 'Erreur d\'authentification.';
  }

  /**
   * Log une erreur
   */
  private logError(error: AppError): void {
    // Console en développement
    if (import.meta.env.DEV) {
      console.error('Error:', {
        type: error.type,
        message: error.message,
        code: error.code,
        retryable: error.retryable,
        originalError: error.originalError,
      });
    }

    // Sentry (si initialisé)
    if (this.sentryEnabled) {
      try {
        // Sentry est déjà chargé, on peut l'utiliser directement
        import('@sentry/react').then((Sentry) => {
          Sentry.captureException(error.originalError || new Error(error.message), {
            tags: {
              errorType: error.type,
              retryable: error.retryable ? 'true' : 'false',
            },
            extra: {
              code: error.code,
              message: error.message,
            },
          });
        }).catch(() => {
          // Sentry non disponible, ignorer silencieusement
        });
      } catch {
        // Ignorer si Sentry n'est pas disponible
      }
    }
  }

  /**
   * Affiche un message d'erreur à l'utilisateur
   */
  showError(error: AppError): void {
    // Utiliser le callback toast si disponible
    if (toastErrorCallback) {
      toastErrorCallback(error.message);
    } else {
      // Fallback vers console si toast n'est pas initialisé
      console.error('User-facing error:', error.message);
    }
  }

  /**
   * Gère une erreur et l'affiche automatiquement
   */
  handleAndShowError(error: unknown): AppError {
    const appError = this.handleError(error);
    this.showError(appError);
    return appError;
  }
}

// Instance globale
export const errorHandler = new ErrorHandler();

// Initialiser avec la config d'environnement (async)
if (typeof window !== 'undefined') {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (sentryDsn) {
    // Initialiser Sentry de manière asynchrone pour ne pas bloquer le chargement
    errorHandler.init(sentryDsn).catch((error) => {
      console.warn('Failed to initialize error handler:', error);
    });
  }
}

