'use client';

import { ArrowLeft, Check } from 'lucide-react';

import type { ModuleConfiguration } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { passesOf, passProgress, type RecordedMeasurement } from './slots';

/**
 * The last step of a run: what was recorded, before the coach calls it done.
 *
 * Reached by working through the last stage. Before this existed, finishing a
 * test left the coach on the entry grid with no statement that anything was
 * complete and no way forward except the browser's back button.
 *
 * ## Why it lists the stages rather than the values
 *
 * The values are on the screen the coach just left. What they cannot see from
 * there is the shape of the whole test — which stage is full, which is short,
 * which was never touched. That is the question a summary answers, and it is
 * the question that decides whether to finish the test or go back.
 *
 * **There is no "finished" state here.** Completing navigates to the test's
 * overview, which is the screen for reading a test — a finished one included.
 * Two screens claiming to be "the test after the run" would drift apart.
 *
 * ## Finishing is a decision, not a consequence
 *
 * A full test is not automatically completed. §11: whether a test is done is a
 * professional judgement, and a stage left deliberately empty is a legitimate
 * finished test. So the button says what it does and the coach presses it.
 */
export function TestSummary({
  configuration,
  measurements,
  pending,
  onComplete,
  onBackToStages,
}: {
  readonly configuration: ModuleConfiguration;
  readonly measurements: readonly RecordedMeasurement[];
  readonly pending: boolean;
  readonly onComplete: () => void;
  readonly onBackToStages: () => void;
}) {
  const stages = passesOf(configuration).map((pass) => {
    const progress = passProgress(configuration, measurements, pass);

    return {
      pass,
      ...progress,
      complete: progress.expected > 0 && progress.filled >= progress.expected,
      empty: progress.filled === 0,
    };
  });

  const missing = stages.reduce((total, stage) => total + (stage.expected - stage.filled), 0);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Übersicht vor dem Abschluss</h2>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {missing === 0
            ? 'Alle vorgesehenen Werte sind erfasst.'
            : `${String(missing)} ${missing === 1 ? 'Wert ist' : 'Werte sind'} nicht erfasst. Ein leer gelassener Wert bleibt leer — das ist eine gültige Durchführung, wenn Sie ihn bewusst ausgelassen haben.`}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {stages.map((stage) => (
          <li
            key={String(stage.pass)}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
          >
            <span className="text-sm font-medium">
              {stage.pass === null ? 'Erfasste Werte' : `Stufe ${String(stage.pass)}`}
            </span>

            <span className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground" data-numeric>
                {stage.filled}/{stage.expected}
              </span>
              {stage.complete ? (
                <Badge variant="accent">
                  <Check aria-hidden="true" className="size-3.5" />
                  vollständig
                </Badge>
              ) : stage.empty ? (
                <Badge variant="outline">leer</Badge>
              ) : (
                <Badge variant="secondary">unvollständig</Badge>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Primary action last, so it sits on the right where there is room and
          at the end of the stack where there is not. */}
      <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        <Button variant="ghost" className={TOUCH_BUTTON} onClick={onBackToStages}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Zurück zu den Stufen
        </Button>

        <Button variant="accent" className={TOUCH_BUTTON} disabled={pending} onClick={onComplete}>
          <Check aria-hidden="true" className="size-4" />
          Test abschließen
        </Button>
      </div>
    </section>
  );
}
