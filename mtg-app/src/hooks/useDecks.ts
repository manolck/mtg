// src/hooks/useDecks.ts
import { useState, useEffect, useCallback } from 'react';
import * as deckService from '../services/deckService';
import type { Deck, DeckEntry, DeckFormat, DeckVisibility, DeckZone } from '../types/deck';
import { useAuth } from './useAuth';

export function useDecks() {
  const { currentUser } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDecks = useCallback(async () => {
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
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadDecks();
    } else {
      setDecks([]);
      setLoading(false);
    }
  }, [currentUser, loadDecks]);

  async function createDeck(
    nameOrInput: string | deckService.CreateDeckInput,
    format: DeckFormat = 'modern'
  ): Promise<string> {
    if (!currentUser) {
      const msg = 'Vous devez être connecté pour créer un deck';
      setError(msg);
      throw new Error(msg);
    }

    try {
      setError(null);
      const deck = await deckService.createDeck(currentUser.uid, nameOrInput, format);
      await loadDecks();
      return deck.id;
    } catch (err) {
      console.error('Error creating deck:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du deck';
      setError(message);
      throw err;
    }
  }

  async function updateDeck(
    deckId: string,
    updates: Parameters<typeof deckService.updateDeck>[1]
  ) {
    if (!currentUser) return;
    try {
      setError(null);
      await deckService.updateDeck(deckId, updates);
      await loadDecks();
    } catch (err) {
      console.error('Error updating deck:', err);
      setError('Erreur lors de la mise à jour du deck');
      throw err;
    }
  }

  async function addCardToDeck(
    deckId: string,
    entry: DeckEntry | string,
    quantity: number = 1,
    zone: DeckZone = 'mainboard'
  ) {
    if (!currentUser) return;

    try {
      setError(null);
      if (typeof entry === 'string') {
        await deckService.addCardToDeck(deckId, entry, quantity, zone);
      } else {
        await deckService.addEntryToDeck(deckId, { ...entry, quantity: entry.quantity || quantity }, zone);
      }
      await loadDecks();
    } catch (err) {
      console.error('Error adding card to deck:', err);
      setError("Erreur lors de l'ajout de la carte au deck");
      throw err;
    }
  }

  async function removeCardFromDeck(deckId: string, cardId: string, zone: DeckZone = 'mainboard') {
    if (!currentUser) return;

    try {
      setError(null);
      await deckService.removeCardFromDeck(deckId, cardId, zone);
      await loadDecks();
    } catch (err) {
      console.error('Error removing card from deck:', err);
      setError('Erreur lors de la suppression de la carte du deck');
      throw err;
    }
  }

  async function updateCardQuantity(
    deckId: string,
    cardId: string,
    quantity: number,
    zone: DeckZone = 'mainboard'
  ) {
    if (!currentUser) return;

    try {
      setError(null);
      await deckService.updateCardQuantityInDeck(deckId, cardId, quantity, zone);
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

  async function setVisibility(deckId: string, visibility: DeckVisibility, isValid?: boolean) {
    if (!currentUser) return;
    await deckService.setDeckVisibility(deckId, visibility, isValid);
    await loadDecks();
  }

  async function forkDeck(sourceDeckId: string): Promise<string> {
    if (!currentUser) {
      throw new Error('Vous devez être connecté');
    }
    const deck = await deckService.forkDeck(sourceDeckId);
    await loadDecks();
    return deck.id;
  }

  return {
    decks,
    loading,
    error,
    createDeck,
    updateDeck,
    addCardToDeck,
    removeCardFromDeck,
    updateCardQuantity,
    deleteDeck,
    setVisibility,
    forkDeck,
    refresh: loadDecks,
  };
}
