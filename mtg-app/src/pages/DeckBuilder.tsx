import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDecks } from '../hooks/useDecks';
import { useCollection } from '../hooks/useCollection';
import { CardDisplay } from '../components/Card/CardDisplay';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { UserCard } from '../types/card';

export function DeckBuilder() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { decks, loading: decksLoading, removeCardFromDeck, updateCardQuantity } = useDecks();
  const { cards: collectionCards } = useCollection();
  const [deckCards, setDeckCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);

  const deck = decks.find((d) => d.id === deckId);

  useEffect(() => {
    async function loadDeckCards() {
      if (!deckId || !deck) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const deckCardsData: UserCard[] = [];

        for (const deckCard of deck.cards) {
          // Chercher la carte dans la collection
          const collectionCard = collectionCards.find((c) => c.id === deckCard.cardId);
          
          if (collectionCard) {
            // Créer une copie avec la quantité du deck
            deckCardsData.push({
              ...collectionCard,
              quantity: deckCard.quantity,
            });
          } else {
            // Si la carte n'est pas dans la collection, essayer de la charger depuis Firestore
            try {
              const cardDoc = await getDoc(
                doc(db, 'users', deck.userId, 'collection', deckCard.cardId)
              );
              if (cardDoc.exists()) {
                const data = cardDoc.data();
                deckCardsData.push({
                  id: cardDoc.id,
                  ...data,
                  quantity: deckCard.quantity,
                  createdAt: data.createdAt?.toDate() || new Date(),
                } as UserCard);
              }
            } catch (err) {
              console.error(`Error loading card ${deckCard.cardId}:`, err);
            }
          }
        }

        setDeckCards(deckCardsData);
      } catch (err) {
        console.error('Error loading deck cards:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDeckCards();
  }, [deckId, deck, collectionCards]);

  const handleRemoveCard = async (cardId: string) => {
    if (!deckId) return;
    try {
      await removeCardFromDeck(deckId, cardId);
    } catch (err) {
      console.error('Error removing card:', err);
    }
  };

  const handleUpdateQuantity = async (cardId: string, newQuantity: number) => {
    if (!deckId || newQuantity < 1) return;
    try {
      await updateCardQuantity(deckId, cardId, newQuantity);
    } catch (err) {
      console.error('Error updating quantity:', err);
    }
  };

  if (decksLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
            Deck introuvable
          </p>
          <Button onClick={() => navigate('/decks')}>Retour aux decks</Button>
        </div>
      </div>
    );
  }

  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="secondary" onClick={() => navigate('/decks')} className="mb-4">
          ← Retour aux decks
        </Button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {deck.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {totalCards} carte{totalCards !== 1 ? 's' : ''} au total
            </p>
          </div>
        </div>
      </div>

      {deckCards.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            Ce deck est vide.
          </p>
          <Button onClick={() => navigate('/collection')}>
            Ajouter des cartes depuis la collection
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {deckCards.map((card) => (
            <div key={card.id} className="relative">
              <CardDisplay card={card} showQuantity={true} />
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleUpdateQuantity(card.id, card.quantity - 1)}
                  disabled={card.quantity <= 1}
                  className="flex-1"
                >
                  -
                </Button>
                <span className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-center">
                  {card.quantity}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => handleUpdateQuantity(card.id, card.quantity + 1)}
                  className="flex-1"
                >
                  +
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleRemoveCard(card.id)}
                >
                  Retirer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

