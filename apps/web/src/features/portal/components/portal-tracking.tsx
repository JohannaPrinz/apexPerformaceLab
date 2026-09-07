'use client';

import {
  BiofeedbackWeek,
  type BiofeedbackWeekView,
  CycleMonth,
  type CycleMonthView,
  NutritionWeek,
  type NutritionWeekView,
} from '@/features/athletes';

import {
  clearPortalBiofeedbackAction,
  clearPortalNutritionAction,
  removePortalBleedingAction,
  setPortalBiofeedbackAction,
  setPortalBiofeedbackNoteAction,
  setPortalBleedingDayAction,
  setPortalNutritionAction,
} from '../server/tracking-actions';

/**
 * The athlete's half of the tracking tables (§21).
 *
 * The counterpart to `coachWrites` in `trend-cards.tsx`, and the reason this
 * file is three lines of binding rather than three copies of a table: the
 * tables name no athlete, so the only difference between the two surfaces is
 * which procedures the writes go through.
 *
 * **What is bound here, and what is not.** Values and remarks are the athlete's
 * — they are the ones who slept badly, ate, bled. Absent on purpose:
 *
 * - `configure` on the biofeedback table. Which quantities are followed is a
 *   coaching decision, so the row controls stay on the coach's page.
 * - `onRemove` on both tables. A card is on the profile because the coach put
 *   it there; taking it off is not the athlete's to do.
 *
 * Both are absent rather than disabled: a control the athlete cannot use is
 * still a control they can be confused by. The server refuses either way — the
 * procedures for them do not exist on this rung at all.
 */
export function PortalTracking({
  nutrition,
  biofeedback,
  cycle,
}: {
  readonly nutrition: NutritionWeekView | null;
  readonly biofeedback: BiofeedbackWeekView | null;
  readonly cycle: CycleMonthView | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {nutrition === null ? null : (
        <NutritionWeek
          week={nutrition}
          writes={{
            setValue: setPortalNutritionAction,
            clearValue: clearPortalNutritionAction,
          }}
        />
      )}

      {biofeedback === null ? null : (
        <BiofeedbackWeek
          week={biofeedback}
          writes={{
            setValue: setPortalBiofeedbackAction,
            clearValue: clearPortalBiofeedbackAction,
            setNote: setPortalBiofeedbackNoteAction,
          }}
        />
      )}

      {cycle === null ? null : (
        <section
          aria-labelledby="portal-cycle"
          className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3 sm:p-4"
        >
          <h3 id="portal-cycle" className="text-sm font-medium">
            Zyklus
          </h3>
          <CycleMonth
            month={cycle}
            writes={{
              setDay: setPortalBleedingDayAction,
              removeRange: removePortalBleedingAction,
            }}
          />
        </section>
      )}
    </div>
  );
}
