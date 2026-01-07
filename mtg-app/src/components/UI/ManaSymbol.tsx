import Plaine from '../../assets/Plaine.png';
import ile from '../../assets/ile.png';
import marrais from '../../assets/marrais.png';
import montagne from '../../assets/montagne.png';
import foret from '../../assets/foret.png';

interface ManaSymbolProps {
  color: 'W' | 'U' | 'B' | 'R' | 'G' | 'Colorless' | 'Multicolor';
  size?: number;
  className?: string;
}

export function ManaSymbol({ color, size = 24, className = '' }: ManaSymbolProps) {
  const baseClasses = 'inline-block flex-shrink-0';
  const imageStyle = { width: size, height: size, display: 'inline-block', objectFit: 'contain' };
  
  switch (color) {
    case 'W':
      return (
        <img
          src={Plaine}
          alt="White mana"
          width={size}
          height={size}
          className={`${baseClasses} ${className}`}
          style={imageStyle}
        />
      );
    case 'U':
      return (
        <img
          src={ile}
          alt="Blue mana"
          width={size}
          height={size}
          className={`${baseClasses} ${className}`}
          style={imageStyle}
        />
      );
    case 'B':
      return (
        <img
          src={marrais}
          alt="Black mana"
          width={size}
          height={size}
          className={`${baseClasses} ${className}`}
          style={imageStyle}
        />
      );
    case 'R':
      return (
        <img
          src={montagne}
          alt="Red mana"
          width={size}
          height={size}
          className={`${baseClasses} ${className}`}
          style={imageStyle}
        />
      );
    case 'G':
      return (
        <img
          src={foret}
          alt="Green mana"
          width={size}
          height={size}
          className={`${baseClasses} ${className}`}
          style={imageStyle}
        />
      );
    case 'Colorless':
      return (
        <div
          className={`${baseClasses} ${className} rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center`}
          style={{ width: size, height: size }}
          title="Colorless"
        >
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">C</span>
        </div>
      );
    case 'Multicolor':
      return (
        <div
          className={`${baseClasses} ${className} rounded-full bg-gradient-to-br from-yellow-400 via-blue-500 to-red-500 flex items-center justify-center`}
          style={{ width: size, height: size }}
          title="Multicolor"
        >
          <span className="text-xs font-bold text-white">M</span>
        </div>
      );
    default:
      return null;
  }
}

