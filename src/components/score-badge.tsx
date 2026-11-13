import type { CSSProperties } from 'react';

export type ScoreRarityView = {
  key: string;
  label: string;
  colorToken: string;
};

type Props = {
  score: number;
  rarity: ScoreRarityView | null;
  compact?: boolean;
  size?: 'md' | 'lg';
};

/**
 * Score badge with its rarity band.
 *
 * The band comes from the database (`articles.rarity_key` is filled by a
 * trigger), so this component never decides which tier a score belongs to.
 */
export function ScoreBadge({ score, rarity, compact = false, size = 'md' }: Props) {
  const colorToken = rarity?.colorToken ?? 'neutral';
  const style = {
    '--rarity-color': `var(--rarity-${colorToken})`,
  } as CSSProperties;

  return (
    <span
      className={[
        'score-badge',
        compact ? 'score-badge-compact' : '',
        size === 'lg' ? 'score-badge-lg' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-rarity={rarity?.key ?? 'none'}
      style={style}
      aria-label={`Puntuación ${score}${rarity ? `, rareza ${rarity.label}` : ''}`}
    >
      <strong>{score}</strong>
      {!compact && rarity ? <span>{rarity.label}</span> : null}
    </span>
  );
}
