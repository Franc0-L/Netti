import { ScoreBadge, type ScoreRarityView } from '@/components/score-badge';
import type { ScoreDetails } from '@/db/schema';

type Props = {
  score: number;
  rarity: ScoreRarityView | null;
  details: ScoreDetails | null;
};

const DIMENSIONS = [
  ['story', 'Historia'],
  ['gameplay', 'Jugabilidad'],
  ['visual', 'Apartado visual'],
] as const;

/** Score badge plus the editorial breakdown (historia, jugabilidad, visual). */
export function ScoreBreakdown({ score, rarity, details }: Props) {
  const rows = DIMENSIONS.filter(([key]) => details?.[key] !== undefined);

  return (
    <div className="score-breakdown">
      <ScoreBadge score={score} rarity={rarity} size="lg" />
      {rows.length > 0 ? (
        <dl className="score-details" aria-label="Subpuntuaciones de la reseña">
          {rows.map(([key, label]) => {
            const value = details?.[key] ?? 0;
            return (
              <div className="score-detail" key={key}>
                <dt>{label}</dt>
                <dd>
                  <span className="score-bar" aria-hidden="true">
                    <span style={{ width: `${value * 10}%` }} />
                  </span>
                  <strong>{`${value} / 10`}</strong>
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </div>
  );
}
