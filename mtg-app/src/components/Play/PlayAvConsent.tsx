import { Button } from '../UI/Button';
import { Modal } from '../UI/Modal';

interface PlayAvConsentProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function PlayAvConsent({ isOpen, onAccept, onDecline }: PlayAvConsentProps) {
  return (
    <Modal isOpen={isOpen} onClose={onDecline} title="Micro" size="md">
      <div className="space-y-4 text-gray-700 dark:text-gray-300">
        <p>
          La table de playtest peut diffuser votre micro aux autres joueurs du lobby (pair-à-pair
          WebRTC). Le flux ne transite pas par nos serveurs ; PocketBase ne sert qu’au signaling.
        </p>
        <p>
          Vous pouvez refuser : la partie continue sans audio. Ensuite, l’icône ⚙ permet de choisir
          le micro, ou de le couper à tout moment.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={onAccept} className="flex-1">
            Autoriser le micro
          </Button>
          <Button variant="secondary" onClick={onDecline} className="flex-1">
            Continuer sans
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export const PLAY_AV_CONSENT_KEY = 'mtg-play-av-consent';
