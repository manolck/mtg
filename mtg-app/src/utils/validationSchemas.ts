import { z } from 'zod';

/**
 * Schémas de validation Zod pour les données critiques de l'application
 */

// Schéma pour une carte parsée depuis CSV
export const ParsedCardSchema = z.object({
  name: z.string().min(1, 'Le nom de la carte est requis'),
  quantity: z.number().int().positive().default(1),
  setCode: z.string().optional(),
  set: z.string().optional(),
  collectorNumber: z.string().optional(),
  rarity: z.string().optional(),
  condition: z.string().optional(),
  language: z.string().optional(),
  multiverseid: z.number().int().positive().optional(),
  scryfallId: z.string().optional(),
  foil: z.boolean().optional(),
});

// Schéma pour un deck
export const DeckSchema = z.object({
  name: z.string().min(1, 'Le nom du deck est requis').max(100, 'Le nom du deck ne peut pas dépasser 100 caractères'),
  description: z.string().max(500, 'La description ne peut pas dépasser 500 caractères').optional(),
  format: z.string().optional(),
  isPublic: z.boolean().default(false),
});

// Schéma pour un profil utilisateur
export const UserProfileSchema = z.object({
  displayName: z.string().min(1, 'Le nom d\'affichage est requis').max(50, 'Le nom d\'affichage ne peut pas dépasser 50 caractères'),
  bio: z.string().max(500, 'La bio ne peut pas dépasser 500 caractères').optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

// Schéma pour un item de wishlist
export const WishlistItemSchema = z.object({
  name: z.string().min(1, 'Le nom de la carte est requis'),
  quantity: z.number().int().positive().default(1),
  setCode: z.string().optional(),
  collectorNumber: z.string().optional(),
  rarity: z.string().optional(),
  language: z.string().optional(),
});

// Schéma pour les données d'import CSV (validation globale)
export const CSVImportSchema = z.object({
  cards: z.array(ParsedCardSchema).min(1, 'Au moins une carte est requise').max(10000, 'L\'import ne peut pas contenir plus de 10000 cartes'),
});

/**
 * Valide une carte parsée depuis CSV
 */
export function validateParsedCard(card: unknown): { success: true; data: z.infer<typeof ParsedCardSchema> } | { success: false; error: string } {
  try {
    const validated = ParsedCardSchema.parse(card);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return { success: false, error: firstError.message };
    }
    return { success: false, error: 'Erreur de validation inconnue' };
  }
}

/**
 * Valide un tableau de cartes parsées
 */
export function validateParsedCards(cards: unknown[]): { success: true; data: z.infer<typeof ParsedCardSchema>[] } | { success: false; errors: Array<{ index: number; error: string }> } {
  const errors: Array<{ index: number; error: string }> = [];
  const validatedCards: z.infer<typeof ParsedCardSchema>[] = [];

  cards.forEach((card, index) => {
    const result = validateParsedCard(card);
    if (result.success) {
      validatedCards.push(result.data);
    } else {
      const errorMessage = 'error' in result ? result.error : 'Erreur de validation inconnue';
      errors.push({ index, error: errorMessage });
    }
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: validatedCards };
}

/**
 * Valide un deck
 */
export function validateDeck(deck: unknown): { success: true; data: z.infer<typeof DeckSchema> } | { success: false; error: string } {
  try {
    const validated = DeckSchema.parse(deck);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return { success: false, error: firstError.message };
    }
    return { success: false, error: 'Erreur de validation inconnue' };
  }
}

/**
 * Valide un profil utilisateur
 */
export function validateUserProfile(profile: unknown): { success: true; data: z.infer<typeof UserProfileSchema> } | { success: false; error: string } {
  try {
    const validated = UserProfileSchema.parse(profile);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return { success: false, error: firstError.message };
    }
    return { success: false, error: 'Erreur de validation inconnue' };
  }
}

/**
 * Valide un item de wishlist
 */
export function validateWishlistItem(item: unknown): { success: true; data: z.infer<typeof WishlistItemSchema> } | { success: false; error: string } {
  try {
    const validated = WishlistItemSchema.parse(item);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return { success: false, error: firstError.message };
    }
    return { success: false, error: 'Erreur de validation inconnue' };
  }
}

