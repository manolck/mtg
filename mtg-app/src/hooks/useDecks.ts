import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Deck, DeckCard } from '../types/deck';
import { useAuth } from './useAuth';

export function useDecks() {
  const { currentUser } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      loadDecks();
    } else {
      setDecks([]);
      setLoading(false);
    }
  }, [currentUser]);

  async function loadDecks() {
    if (!currentUser) return;

    try {
      setLoading(true);
      const decksRef = collection(db, 'users', currentUser.uid, 'decks');
      const snapshot = await getDocs(decksRef);
      const decksData: Deck[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        decksData.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as Deck);
      });

      setDecks(decksData);
      setError(null);
    } catch (err) {
      console.error('Error loading decks:', err);
      setError('Erreur lors du chargement des decks');
    } finally {
      setLoading(false);
    }
  }

  async function createDeck(name: string): Promise<string> {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);
      const decksRef = collection(db, 'users', currentUser.uid, 'decks');
      const docRef = await addDoc(decksRef, {
        name,
        cards: [],
        userId: currentUser.uid,
        createdAt: new Date(),
      });

      await loadDecks();
      return docRef.id;
    } catch (err) {
      console.error('Error creating deck:', err);
      setError('Erreur lors de la création du deck');
      throw err;
    }
  }

  async function addCardToDeck(deckId: string, cardId: string, quantity: number = 1) {
    if (!currentUser) return;

    try {
      setError(null);
      const deckRef = doc(db, 'users', currentUser.uid, 'decks', deckId);
      const deck = decks.find((d) => d.id === deckId);

      if (!deck) {
        throw new Error('Deck not found');
      }

      // Vérifier si la carte existe déjà dans le deck
      const existingCardIndex = deck.cards.findIndex((c) => c.cardId === cardId);

      let updatedCards: DeckCard[];
      if (existingCardIndex >= 0) {
        // Mettre à jour la quantité
        updatedCards = [...deck.cards];
        updatedCards[existingCardIndex] = {
          ...updatedCards[existingCardIndex],
          quantity: updatedCards[existingCardIndex].quantity + quantity,
        };
      } else {
        // Ajouter la carte
        updatedCards = [...deck.cards, { cardId, quantity }];
      }

      await updateDoc(deckRef, {
        cards: updatedCards,
      });

      await loadDecks();
    } catch (err) {
      console.error('Error adding card to deck:', err);
      setError('Erreur lors de l\'ajout de la carte au deck');
      throw err;
    }
  }

  async function removeCardFromDeck(deckId: string, cardId: string) {
    if (!currentUser) return;

    try {
      setError(null);
      const deckRef = doc(db, 'users', currentUser.uid, 'decks', deckId);
      const deck = decks.find((d) => d.id === deckId);

      if (!deck) {
        throw new Error('Deck not found');
      }

      const updatedCards = deck.cards.filter((c) => c.cardId !== cardId);

      await updateDoc(deckRef, {
        cards: updatedCards,
      });

      await loadDecks();
    } catch (err) {
      console.error('Error removing card from deck:', err);
      setError('Erreur lors de la suppression de la carte du deck');
      throw err;
    }
  }

  async function updateCardQuantity(deckId: string, cardId: string, quantity: number) {
    if (!currentUser) return;

    try {
      setError(null);
      const deckRef = doc(db, 'users', currentUser.uid, 'decks', deckId);
      const deck = decks.find((d) => d.id === deckId);

      if (!deck) {
        throw new Error('Deck not found');
      }

      const updatedCards = deck.cards.map((c) =>
        c.cardId === cardId ? { ...c, quantity } : c
      );

      await updateDoc(deckRef, {
        cards: updatedCards,
      });

      await loadDecks();
    } catch (err) {
      console.error('Error updating card quantity:', err);
      setError('Erreur lors de la mise à jour de la quantité');
      throw err;
    }
  }

  async function deleteDeck(deckId: string) {
    if (!currentUser) return;

    try {
      const deckRef = doc(db, 'users', currentUser.uid, 'decks', deckId);
      await deleteDoc(deckRef);
      await loadDecks();
    } catch (err) {
      console.error('Error deleting deck:', err);
      setError('Erreur lors de la suppression du deck');
      throw err;
    }
  }

  return {
    decks,
    loading,
    error,
    createDeck,
    addCardToDeck,
    removeCardFromDeck,
    updateCardQuantity,
    deleteDeck,
    refresh: loadDecks,
  };
}

