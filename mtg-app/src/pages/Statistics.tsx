import { useState, useEffect, useMemo } from 'react';
import { useCollection } from '../hooks/useCollection';
import { calculateCollectionValue } from '../services/priceService';
import { Button } from '../components/UI/Button';

export function Statistics() {
  const { allCards, loading } = useCollection();
  const [collectionValue, setCollectionValue] = useState<number | null>(null);
  const [loadingValue, setLoadingValue] = useState(false);
  const [currency, setCurrency] = useState<'usd' | 'eur'>('usd');

  useEffect(() => {
    if (allCards.length > 0 && !collectionValue && !loadingValue) {
      loadCollectionValue();
    }
  }, [allCards.length]);

  const loadCollectionValue = async () => {
    setLoadingValue(true);
    try {
      const { total } = await calculateCollectionValue(allCards, currency);
      setCollectionValue(total);
    } catch (error) {
      console.error('Error calculating collection value:', error);
    } finally {
      setLoadingValue(false);
    }
  };

  // Statistiques par couleur
  const statsByColor = useMemo(() => {
    const colorCounts: Record<string, number> = {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      Colorless: 0,
    };

    allCards.forEach((card) => {
      const colors = card.mtgData?.colors || [];
      if (colors.length === 0) {
        colorCounts.Colorless++;
      } else {
        colors.forEach((color) => {
          colorCounts[color] = (colorCounts[color] || 0) + card.quantity;
        });
      }
    });

    return colorCounts;
  }, [allCards]);

  // Statistiques par rareté
  const statsByRarity = useMemo(() => {
    const rarityCounts: Record<string, number> = {};

    allCards.forEach((card) => {
      const rarity = card.rarity || card.mtgData?.rarity || 'Unknown';
      rarityCounts[rarity] = (rarityCounts[rarity] || 0) + card.quantity;
    });

    return rarityCounts;
  }, [allCards]);

  // Statistiques par édition
  const statsBySet = useMemo(() => {
    const setCounts: Record<string, number> = {};

    allCards.forEach((card) => {
      const set = card.set || card.setCode || 'Unknown';
      setCounts[set] = (setCounts[set] || 0) + card.quantity;
    });

    return setCounts;
  }, [allCards]);

  // Total de cartes
  const totalCards = useMemo(() => {
    return allCards.reduce((sum, card) => sum + card.quantity, 0);
  }, [allCards]);

  // Nombre de cartes uniques
  const uniqueCards = allCards.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">Chargement des statistiques...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        Statistiques de la Collection
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Valeur estimée */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Valeur Estimée
          </h2>
          <div className="flex items-center justify-between mb-4">
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value as 'usd' | 'eur');
                setCollectionValue(null);
                loadCollectionValue();
              }}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
            </select>
            <Button
              variant="secondary"
              onClick={loadCollectionValue}
              loading={loadingValue}
              className="text-sm"
            >
              Actualiser
            </Button>
          </div>
          {collectionValue !== null ? (
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: currency.toUpperCase(),
              }).format(collectionValue)}
            </p>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">
              Cliquez sur "Actualiser" pour calculer
            </p>
          )}
        </div>

        {/* Total de cartes */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Total de Cartes
          </h2>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalCards}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {uniqueCards} carte{uniqueCards !== 1 ? 's' : ''} unique{uniqueCards !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Cartes par couleur */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Par Couleur
          </h2>
          <div className="space-y-2">
            {Object.entries(statsByColor).map(([color, count]) => (
              <div key={color} className="flex justify-between items-center">
                <span className="text-gray-700 dark:text-gray-300 capitalize">
                  {color === 'W' ? 'White' : color === 'U' ? 'Blue' : color === 'B' ? 'Black' : color === 'R' ? 'Red' : color === 'G' ? 'Green' : color}
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graphiques (à implémenter avec Chart.js ou Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Par rareté */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Par Rareté
          </h2>
          <div className="space-y-2">
            {Object.entries(statsByRarity)
              .sort(([, a], [, b]) => b - a)
              .map(([rarity, count]) => (
                <div key={rarity} className="flex justify-between items-center">
                  <span className="text-gray-700 dark:text-gray-300">{rarity}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{count}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Top éditions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Top 10 Éditions
          </h2>
          <div className="space-y-2">
            {Object.entries(statsBySet)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([set, count]) => (
                <div key={set} className="flex justify-between items-center">
                  <span className="text-gray-700 dark:text-gray-300">{set}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}


