import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';

interface GDPRConsentProps {
  onAccept?: () => void;
  onReject?: () => void;
}

export function GDPRConsent({ onAccept, onReject }: GDPRConsentProps) {
  const { currentUser } = useAuth();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    checkConsent();
  }, [currentUser]);

  async function checkConsent() {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      const consentRef = doc(db, 'users', currentUser.uid, 'legal', 'gdpr-consent');
      const consentSnap = await getDoc(consentRef);

      if (!consentSnap.exists()) {
        // Pas de consentement enregistré, afficher le modal
        setShow(true);
      }
    } catch (error) {
      console.error('Error checking GDPR consent:', error);
      // En cas d'erreur, afficher le modal par sécurité
      setShow(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!currentUser) return;

    try {
      setAccepting(true);
      const consentRef = doc(db, 'users', currentUser.uid, 'legal', 'gdpr-consent');
      await setDoc(consentRef, {
        accepted: true,
        timestamp: new Date(),
        version: '1.0', // Version de la politique de confidentialité
      });

      setShow(false);
      onAccept?.();
    } catch (error) {
      console.error('Error saving GDPR consent:', error);
      alert('Erreur lors de l\'enregistrement du consentement. Veuillez réessayer.');
    } finally {
      setAccepting(false);
    }
  }

  function handleReject() {
    // En cas de refus, on peut rediriger vers une page d'information
    // ou simplement fermer l'application
    setShow(false);
    onReject?.();
    // Optionnel : rediriger vers une page d'information
    // window.location.href = '/gdpr-info';
  }

  if (loading || !show) {
    return null;
  }

  return (
    <Modal
      isOpen={show}
      onClose={() => {}} // Empêcher la fermeture sans consentement
      title="Consentement RGPD"
      size="lg"
    >
      <div className="space-y-4">
        <div className="prose dark:prose-invert max-w-none">
          <p className="text-gray-700 dark:text-gray-300">
            Nous respectons votre vie privée et vos données personnelles. Conformément au 
            Règlement Général sur la Protection des Données (RGPD), nous devons obtenir votre 
            consentement pour traiter vos données personnelles.
          </p>

          <h3 className="text-lg font-semibold mt-4 mb-2">Données collectées</h3>
          <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
            <li>Adresse email (pour l'authentification)</li>
            <li>Pseudonyme (optionnel)</li>
            <li>Collection de cartes Magic: The Gathering</li>
            <li>Decks créés</li>
            <li>Wishlist</li>
            <li>Statistiques de collection</li>
            <li>Avatar sélectionné</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4 mb-2">Utilisation des données</h3>
          <p className="text-gray-700 dark:text-gray-300">
            Vos données sont utilisées uniquement pour :
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
            <li>Fournir les fonctionnalités de l'application</li>
            <li>Améliorer l'expérience utilisateur</li>
            <li>Gérer votre compte et vos préférences</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4 mb-2">Vos droits</h3>
          <p className="text-gray-700 dark:text-gray-300">
            Conformément au RGPD, vous avez le droit de :
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
            <li>Accéder à vos données personnelles</li>
            <li>Rectifier vos données</li>
            <li>Supprimer votre compte et toutes vos données</li>
            <li>Exporter vos données</li>
            <li>Vous opposer au traitement de vos données</li>
          </ul>

          <p className="mt-4 text-gray-700 dark:text-gray-300">
            Pour plus d'informations, consultez notre{' '}
            <a
              href="/privacy-policy"
              className="text-blue-600 dark:text-blue-400 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Ouvrir dans un nouvel onglet
                window.open('/privacy-policy', '_blank');
              }}
            >
              Politique de Confidentialité
            </a>
            .
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="flex-1"
            variant="primary"
          >
            {accepting ? 'Enregistrement...' : 'J\'accepte'}
          </Button>
          <Button
            onClick={handleReject}
            disabled={accepting}
            className="flex-1"
            variant="secondary"
          >
            Refuser
          </Button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          En cliquant sur "J'accepte", vous confirmez avoir lu et accepté notre politique de confidentialité.
        </p>
      </div>
    </Modal>
  );
}

