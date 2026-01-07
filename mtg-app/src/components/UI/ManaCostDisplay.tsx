import { ManaSymbol } from './ManaSymbol';

/**
 * Parse le coût de mana (ex: "{4}{G}{U}") et retourne les éléments à afficher
 */
function parseManaCost(manaCost: string): Array<{ type: 'number' | 'color'; value: string }> {
  if (!manaCost) return [];
  
  // Pattern pour matcher {X} où X peut être un nombre ou une couleur
  const pattern = /\{([^}]+)\}/g;
  const matches = manaCost.matchAll(pattern);
  const result: Array<{ type: 'number' | 'color'; value: string }> = [];
  
  for (const match of matches) {
    const value = match[1];
    // Si c'est un nombre, c'est du mana incolore
    if (/^\d+$/.test(value)) {
      result.push({ type: 'number', value });
    } else {
      // Sinon c'est une couleur (W, U, B, R, G, etc.)
      result.push({ type: 'color', value: value.toUpperCase() });
    }
  }
  
  return result;
}

interface ManaCostDisplayProps {
  manaCost: string;
  size?: number;
}

/**
 * Composant pour afficher le coût de mana avec les images et cercles
 */
export function ManaCostDisplay({ manaCost, size = 16 }: ManaCostDisplayProps) {
  const parsed = parseManaCost(manaCost);
  
  return (
    <div className="flex items-center gap-1">
      {parsed.map((item, idx) => {
        if (item.type === 'number') {
          return (
            <div
              key={idx}
              className="inline-flex items-center justify-center rounded-full bg-gray-400 dark:bg-gray-500"
              style={{ width: size, height: size }}
              title={`${item.value} mana incolore`}
            >
              <span className="text-xs font-bold text-white" style={{ fontSize: size * 0.6 }}>
                {item.value}
              </span>
            </div>
          );
        } else {
          // Couleur de mana
          const colorMap: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = {
            'W': 'W',
            'U': 'U',
            'B': 'B',
            'R': 'R',
            'G': 'G',
          };
          
          const color = colorMap[item.value];
          if (color) {
            return <ManaSymbol key={idx} color={color} size={size} className="flex-shrink-0" />;
          }
          
          return null;
        }
      })}
    </div>
  );
}

