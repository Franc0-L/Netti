import Link from 'next/link';

export type SectionChip = {
  href: string;
  label: string;
  /** Color token of the section: cyan, gold, red or green. */
  tone: 'cyan' | 'gold' | 'red' | 'green';
};

const SECTIONS: SectionChip[] = [
  { href: '/juegos', label: 'Juegos', tone: 'cyan' },
  { href: '/resenas', label: 'Reseñas', tone: 'gold' },
  { href: '/noticias', label: 'Noticias', tone: 'red' },
  { href: '/guias', label: 'Guías', tone: 'green' },
];

type Props = {
  currentPath?: string;
  /** Hides the chip of the section that is being displayed. */
  omit?: string;
};

/**
 * Section chips.
 *
 * Each editorial section keeps the color it had in the legacy site: cyan for
 * games, gold for reviews, red for news and green for guides.
 */
export function SectionChips({ currentPath, omit }: Props) {
  const items = SECTIONS.filter((section) => section.href !== omit);
  return (
    <nav className="section-chips" aria-label="Secciones del sitio">
      {items.map((section) => (
        <Link
          className="section-chip"
          data-tone={section.tone}
          href={section.href}
          key={section.href}
          aria-current={currentPath === section.href ? 'page' : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
