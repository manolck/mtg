import { getAvatarById, getDefaultAvatar, type Avatar } from '../../data/avatars';

interface AvatarDisplayProps {
  avatarId?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-lg',
  lg: 'w-24 h-24 text-3xl',
  xl: 'w-32 h-32 text-4xl',
};

export function AvatarDisplay({ avatarId, size = 'md', className = '' }: AvatarDisplayProps) {
  const avatar = avatarId ? getAvatarById(avatarId) : getDefaultAvatar();
  const displayAvatar = avatar || getDefaultAvatar();

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center border-2 border-gray-300 dark:border-gray-600 ${className}`}
      style={{ backgroundColor: displayAvatar.color }}
      title={displayAvatar.name}
    >
      <span className="select-none">{displayAvatar.emoji}</span>
    </div>
  );
}

