import { Button } from '../UI/Button';
import { Modal } from '../UI/Modal';

interface PlayAvConsentProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function PlayAvConsent({ isOpen, onAccept, onDecline }: PlayAvConsentProps) {
  return (
    <Modal isOpen={isOpen} onClose={onDecline} title="Caméra et micro" size="md">
      <div className="space-y-4 text-gray-700 dark:text-gray-300">
        <p>
          La table de playtest peut diffuser votre caméra et votre micro aux autres joueurs du lobby
          (pair-à-pair WebRTC). Les flux ne transitent pas par nos serveurs ; PocketBase ne sert
          qu’au signaling (offres/ICE).
        </p>
        <p>
          Vous pouvez refuser : la partie continue sans vidéo ni audio. Vous pourrez couper caméra
          et micro à tout moment.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={onAccept} className="flex-1">
            Autoriser caméra et micro
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
