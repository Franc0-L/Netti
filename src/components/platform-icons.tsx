import Image from 'next/image';
import { platformImage } from '@/lib/platforms';

type Props = {
  platforms: string[];
};

/** Platform icons of a game, using the client artwork in `public/images/platforms`. */
export function PlatformIcons({ platforms }: Props) {
  const icons = platforms
    .map((platform) => ({ platform, icon: platformImage(platform) }))
    .filter((item): item is { platform: string; icon: string } => item.icon !== null);

  if (icons.length === 0) return null;

  return (
    <ul className="platform-icons" aria-label="Plataformas">
      {icons.map((item) => (
        <li key={item.platform}>
          <Image src={item.icon} alt={item.platform} width={20} height={20} />
        </li>
      ))}
    </ul>
  );
}
