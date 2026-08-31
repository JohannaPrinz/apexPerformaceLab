import { Badge } from '@apex/ui';

import type { DocumentMovement, DocumentTest } from '@/features/reports';
import { mediaUrl, MovementBlock } from '@/features/reports';

/**
 * What the detail needs of an analysis — the server card, minus the parts only
 * a listing used. Declared here because this is now its only reader.
 */
export interface MovementAnalysisView {
  readonly moduleId: string;
  readonly assessmentId: string;
  readonly name: string;
  readonly profileName: string;
  readonly performedAt: Date;
  readonly repetitions: number;
  readonly rows: readonly {
    key: string;
    coordinates: string;
    track: string | null;
    side: string | null;
    position: string | null;
    degrees: number;
    target: { comparison: 'at_most' | 'at_least' | 'equals'; degrees: number; met: boolean } | null;
  }[];
  readonly movement: DocumentMovement;
  readonly remark: string | null;
  /** The stills of this analysis, while the store still holds them. */
  readonly images: readonly { id: string; key: string; label: string }[];
  readonly published: boolean;
  readonly shared: boolean;
}

/**
 * One analysed movement, in full — the screen a coach lands on from the tile.
 *
 * ## Why the same component as the report
 *
 * The stills, the curve, the tempo and the angle grid are drawn by
 * `MovementBlock`, which is also what an assessment report uses. One recording,
 * one reading of it: a second renderer here would eventually disagree with the
 * document an athlete was sent.
 *
 * ## Why there is no prose
 *
 * Everything on this screen is a picture, a figure or a heading. The one piece
 * of running text is what the coach wrote, and it appears only where they wrote
 * something.
 */

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const SECONDS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/**
 * The analysis as the report reads it.
 *
 * Mapped here rather than on the server so both screens draw the same recording
 * with the same component.
 */
export function testOf(card: MovementAnalysisView): DocumentTest {
  return {
    moduleId: card.moduleId,
    name: card.name,
    typeLabel: card.profileName,
    performedAt: card.performedAt,
    statusLabel: '',
    protocolLabel: null,
    derivations: [],
    rows: card.rows.map((row) => ({
      key: row.key,
      typeName: 'Gelenkwinkel',
      measurementTypeKey: 'joint_angle',
      unit: '°',
      coordinates: row.coordinates,
      // An angle names no exercise; the test it belongs to does.
      exerciseKey: '',
      axes: { track: row.track, side: row.side, position: row.position },
      value: row.degrees,
      capturedAt: card.performedAt,
      previous: null,
      difference: null,
      tendency: null,
      best: null,
      count: 1,
      target: row.target,
      percentile: null,
      source: 'DERIVED',
    })),
    // The working stills of this very analysis, while the store still holds
    // them — see `movementProfilesFor`.
    images: card.images.map((image) => ({
      id: image.id,
      url: mediaUrl(image.key),
      label: image.label,
    })),
    movement: card.movement,
    charts: [],
    // What the coach wrote gets its own heading below, not the block's.
    interpretation: '',
    recommendation: '',
  };
}

export function MovementAnalysisDetail({ card }: { readonly card: MovementAnalysisView }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">{card.profileName}</span>
        <h1 className="text-2xl font-semibold text-pretty">{card.name}</h1>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground" data-numeric>
            {DATE.format(card.performedAt)} · {card.repetitions}{' '}
            {card.repetitions === 1 ? 'Wiederholung' : 'Wiederholungen'} ·{' '}
            {SECONDS.format(card.movement.durationMs / 1000)} s
          </span>
          {/* Wording, never colour alone. Absent where neither is true —
              "nicht geteilt" is not a state anybody needs announced. */}
          {card.published ? <Badge variant="accent">Veröffentlicht</Badge> : null}
          {card.shared ? <Badge variant="outline">Geteilt</Badge> : null}
        </div>
      </header>

      <MovementBlock test={testOf(card)} />

      {/* The only running text on this screen, and only where it exists. */}
      {card.remark === null || card.remark.trim() === '' ? null : (
        <section aria-label="Bemerkung des Coaches" className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Bemerkung des Coaches</h2>
          <p className="max-w-prose text-sm text-pretty whitespace-pre-line">{card.remark}</p>
        </section>
      )}
    </div>
  );
}
