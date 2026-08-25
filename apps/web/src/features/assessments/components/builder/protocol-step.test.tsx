import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { emptyDraft, withMeasurementType, withPasses, type BuilderDraft } from './draft';
import { ProtocolStep } from './protocol-step';

import type { MeasurementTypeOption } from './measurement-picker';

/**
 * Choosing what a stage demanded.
 *
 * A treadmill step test is set in either pace or speed, and the coach says
 * which. The draft rules are covered in `draft.test.ts`; what is pinned here is
 * that the screen offers the choice at all and hands over what was chosen.
 */

const types: readonly MeasurementTypeOption[] = [
  {
    id: 'mt_lactate',
    key: 'lactate',
    name: 'Laktat',
    unit: 'mmol/L',
    category: 'metabolic',
    ownedByWorkspace: false,
  },
  {
    id: 'mt_pace',
    key: 'pace',
    name: 'Pace',
    unit: 'min/km',
    category: 'endurance',
    ownedByWorkspace: false,
  },
  {
    id: 'mt_speed',
    key: 'speed',
    name: 'Speed',
    unit: 'km/h',
    category: 'endurance',
    ownedByWorkspace: false,
  },
];

const stepTest = () =>
  withPasses(
    withMeasurementType(withMeasurementType(emptyDraft('lactate'), 'mt_lactate'), 'mt_pace'),
    4,
  );

function Harness({ start }: { start: BuilderDraft }) {
  const [draft, setDraft] = useState(start);

  return (
    <>
      <ProtocolStep draft={draft} exercises={[]} measurementTypes={types} onChange={setDraft} />
      <output data-testid="load">{draft.loadMeasurementTypeId ?? 'keine'}</output>
    </>
  );
}

describe('naming the load quantity', () => {
  it('offers the quantities this test records', () => {
    render(<Harness start={stepTest()} />);

    expect(screen.getByLabelText('Belastungsgröße')).toBeVisible();
    expect(screen.getByRole('option', { name: 'Pace (min/km)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Laktat (mmol/L)' })).toBeInTheDocument();
  });

  it('offers no quantity the test does not record', () => {
    // Speed is in the catalogue but not in this test: an axis needs a value on
    // every stage.
    render(<Harness start={stepTest()} />);

    expect(screen.queryByRole('option', { name: 'Speed (km/h)' })).toBeNull();
  });

  it('hands over what the coach chose', async () => {
    const user = userEvent.setup();
    render(<Harness start={stepTest()} />);

    await user.selectOptions(screen.getByLabelText('Belastungsgröße'), 'mt_pace');

    expect(screen.getByTestId('load')).toHaveTextContent('mt_pace');
  });

  it('lets a test name none', async () => {
    const user = userEvent.setup();
    const user_draft = { ...stepTest(), loadMeasurementTypeId: 'mt_pace' };
    render(<Harness start={user_draft} />);

    await user.selectOptions(screen.getByLabelText('Belastungsgröße'), '');

    expect(screen.getByTestId('load')).toHaveTextContent('keine');
  });

  it('offers speed once the coach swapped to it', async () => {
    // The case the coach described: the same treadmill test, set in km/h.
    const user = userEvent.setup();
    render(<Harness start={withMeasurementType(stepTest(), 'mt_speed')} />);

    await user.selectOptions(screen.getByLabelText('Belastungsgröße'), 'mt_speed');

    expect(screen.getByTestId('load')).toHaveTextContent('mt_speed');
  });

  it('asks nothing of a single erfassung', () => {
    // One pass, no stages to compare, no demand axis.
    render(<Harness start={withMeasurementType(emptyDraft('body_composition'), 'mt_lactate')} />);

    expect(screen.queryByLabelText('Belastungsgröße')).toBeNull();
  });

  it('says what the diagram does without one', () => {
    render(<Harness start={stepTest()} />);

    expect(screen.getAllByText(/zeigt der Verlauf die Stufenfolge/)[0]).toBeVisible();
  });
});
