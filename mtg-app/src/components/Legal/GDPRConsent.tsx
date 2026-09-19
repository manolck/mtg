// src/components/Legal/GDPRConsent.tsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { pb } from '../../services/pocketbase';
import { pbEqual } from '../../utils/pocketbaseFilter';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';

interface GDPRConsentProps {
  onAccept?: () => void;
  onReject?: () => void;
}

export function GDPRConsent({ onAccept, onReject }: GDPRConsentProps) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const checkConsent = useCallback(async () => {
    if (!currentUser) {
      setShow(false);
      setLoading(false);
      return;
    }

    try {
      const consentRecords = await pb.collection('legal').getFullList({
        filter: `${pbEqual('userId', currentUser.uid)} && ${pbEqual('type', 'gdpr-consent')} && accepted = true`,
        limit: 1,
      });

      setShow(consentRecords.length === 0);
    } catch (error) {
      console.error('Error checking GDPR consent:', error);
      setShow(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    checkConsent();
  }, [checkConsent]);

  async function handleAccept() {
    if (!currentUser) return;

    try {
      setAccepting(true);
      await pb.collection('legal').create({
        userId: currentUser.uid,
        type: 'gdpr-consent',
        accepted: true,
        timestamp: new Date().toISOString(),
        version: '1.0',
      });

      setShow(false);
      onAccept?.();
    } catch (error) {
      console.error('Error saving GDPR consent:', error);
      alert("Erreur lors de l'enregistrement du consentement. Veuillez réessayer.");
    } finally {
      setAccepting(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    onReject?.();
    try {
      await logout();
    } finally {
      navigate('/login?consent=rejected', { replace: true });
      setRejecting(false);
    }
  }

  if (loading || !show) {
    return null;
  }

  return (
    <Modal
      isOpen={show}
      onClose={() => {}}
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
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Sans ce consentement, vous ne pouvez pas utiliser l&apos;application.
          </p>

          <h3 className="text-lg font-semibold mt-4 mb-2">Données collectées</h3>
          <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
            <li>Adresse email (pour l&apos;authentification)</li>
            <li>Pseudonyme (optionnel)</li>
            <li>Collection de cartes Magic: The Gathering</li>
            <li>Decks créés</li>
            <li>Wishlist</li>
            <li>Statistiques de collection</li>
            <li>Avatar sélectionné</li>
            <li>En partie (optionnel) : micro, transmis en pair-à-pair aux joueurs du lobby</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4 mb-2">Utilisation des données</h3>
          <p className="text-gray-700 dark:text-gray-300">
            Vos données sont utilisées uniquement pour :
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
            <li>Fournir les fonctionnalités de l&apos;application</li>
            <li>Améliorer l&apos;expérience utilisateur</li>
            <li>Gérer votre compte et vos préférences</li>
            <li>Permettre le playtest vocal entre joueurs d’un même lobby (WebRTC)</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4 mb-2">Vos droits</h3>
          <p className="text-gray-700 dark:text-gray-300">
            Conformément au RGPD, vous avez le droit de :
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
            <li>Accéder à vos données personnelles</li>
            <li>Rectifier vos données</li>
            <li>Supprimer votre compte et toutes vos données (page Profil)</li>
            <li>Exporter vos données</li>
            <li>Vous opposer au traitement de vos données</li>
          </ul>

          <p className="mt-4 text-gray-700 dark:text-gray-300">
            Pour plus d&apos;informations, consultez notre{' '}
            <a
              href="/privacy-policy"
              className="text-blue-600 dark:text-blue-400 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
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
            disabled={accepting || rejecting}
            className="flex-1"
            variant="primary"
          >
            {accepting ? 'Enregistrement...' : "J'accepte"}
          </Button>
          <Button
            onClick={handleReject}
            disabled={accepting || rejecting}
            className="flex-1"
            variant="secondary"
          >
            {rejecting ? 'Déconnexion...' : 'Refuser'}
          </Button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          En cliquant sur &quot;J&apos;accepte&quot;, vous confirmez avoir lu et accepté notre politique de confidentialité.
          Un refus vous déconnecte et empêche l&apos;utilisation de l&apos;application.
        </p>
      </div>
    </Modal>
  );
}
