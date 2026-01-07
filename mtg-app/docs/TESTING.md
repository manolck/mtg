# Guide de Tests - MTG Collection App

## Installation

Après avoir ajouté les dépendances de test, installez-les :

```bash
npm install
```

## Structure des Tests

```
src/
  __tests__/          # Tests unitaires
  test/              # Configuration et utilitaires de test
    setup.ts         # Configuration globale Jest
    utils.tsx        # Helpers pour les tests React
e2e/                 # Tests end-to-end Playwright
  *.spec.ts
```

## Exécution des Tests

### Tests Unitaires

```bash
# Tous les tests
npm test

# Mode watch (re-exécute les tests à chaque changement)
npm run test:watch

# Avec couverture de code
npm run test:coverage
```

### Tests E2E

```bash
# Tous les tests E2E
npm run test:e2e

# Mode UI interactif
npm run test:e2e:ui
```

## Configuration Jest

Le projet utilise Jest avec support des modules ES (`"type": "module"` dans package.json).

La configuration est dans `jest.config.js` et utilise :
- `ts-jest` pour le support TypeScript
- `jsdom` pour l'environnement de test React
- `@testing-library/react` pour tester les composants React

## Écriture de Tests

### Test Unitaire Simple

```typescript
import { render, screen } from '../test/utils';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Test de Hook

```typescript
import { renderHook } from '@testing-library/react';
import { useMyHook } from './useMyHook';

describe('useMyHook', () => {
  it('returns expected value', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current).toBeDefined();
  });
});
```

## Couverture de Code

Le projet vise une couverture minimale de 70% pour :
- Branches
- Functions
- Lines
- Statements

Vérifiez la couverture avec :
```bash
npm run test:coverage
```

Les rapports sont générés dans `coverage/`.

## Tests E2E avec Playwright

Les tests E2E sont dans le dossier `e2e/` et utilisent Playwright.

### Exemple de Test E2E

```typescript
import { test, expect } from '@playwright/test';

test('should load collection page', async ({ page }) => {
  await page.goto('/collection');
  await expect(page.getByRole('heading')).toBeVisible();
});
```

## Mocking

### Mock Firebase

Les services Firebase sont mockés dans `src/test/setup.ts`.

### Mock API

Pour mocker les appels API :

```typescript
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'test' }),
  })
) as jest.Mock;
```

## Dépannage

### Erreur "Jest n'est pas reconnu"

1. Vérifiez que les dépendances sont installées : `npm install`
2. Vérifiez que `node_modules/.bin` est dans votre PATH

### Erreur avec les modules ES

Le projet utilise `NODE_OPTIONS=--experimental-vm-modules` pour supporter les modules ES avec Jest.

### Tests qui échouent

1. Vérifiez que les mocks sont correctement configurés
2. Vérifiez que `src/test/setup.ts` est bien chargé
3. Vérifiez les imports et les chemins de modules

## Bonnes Pratiques

1. **Un test = une assertion principale**
2. **Nommer les tests clairement** : "should do X when Y"
3. **Tester le comportement, pas l'implémentation**
4. **Utiliser les queries de Testing Library** (getByRole, getByText, etc.)
5. **Éviter les tests fragiles** (ne pas tester les détails d'implémentation)



