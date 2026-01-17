// src/hooks/useDecks.ts
import { useState, useEffect } from 'react';
import * as deckService from '../services/deckService';
import type { Deck } from '../types/deck';
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
      const decksData = await deckService.getDecks(currentUser.uid);
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
      const deck = await deckService.createDeck(currentUser.uid, name);
      await loadDecks();
      return deck.id;
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
      await deckService.addCardToDeck(deckId, cardId, quantity);
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
      await deckService.removeCardFromDeck(deckId, cardId);
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
      await deckService.updateCardQuantityInDeck(deckId, cardId, quantity);
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
      await deckService.deleteDeck(deckId);
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
