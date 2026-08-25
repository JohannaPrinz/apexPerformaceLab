import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MeasurementChart, type ChartGroupView } from './measurement-chart';

/**
 * The diagram states what was recorded and says what its x axis means.
 *
 * The rule under test is the honest one: without a load quantity the axis is a
 * sequence of stages, and the screen has to say that two tests sharing a
 * position on it need not have shared a demand.
 */

const group = (over: Partial<ChartGroupView> = {}): ChartGroupView => ({
  key: 'mt_lactate|BILATERAL||',
  defaultLoadId: null,
  typeName: 'Laktat',
  unit: 'mmol/L',
  side: 'BILATERAL',
  exerciseName: null,
  context: {},
  loadCandidates: [{ id: 'mt_pace', name: 'Pace', unit: 'km/h' }],
  series: [
    {
      moduleId: 'mod_old',
      moduleName: 'Laufen – Laktat, Januar',
      moduleStatus: 'COMPLETED',
      isCurrentModule: false,
      points: [
        { passIndex: 1, y: 1.8, loads: { mt_pace: 10 } },
        { passIndex: 2, y: 2.6, loads: { mt_pace: 11 } },
      ],
    },
    {
      moduleId: 'mod_1',
      moduleName: 'Laufen – Laktat, März',
      moduleStatus: 'COMPLETED',
      isCurrentModule: true,
      points: [
        { passIndex: 1, y: 1.5, loads: { mt_pace: 10 } },
        { passIndex: 2, y: 2.3, loads: { mt_pace: 11 } },
      ],
    },
  ],
  ...over,
});

describe('what the diagram draws', () => {
  it('draws one curve per test, never one for both', () => {
    render(<MeasurementChart groups={[group()]} />);

    // Two polylines: no average curve, no line across tests.
    expect(document.querySelectorAll('polyline')).toHaveLength(2);
  });

  it('names every test in the legend', () => {
    render(<MeasurementChart groups={[group()]} />);

    expect(screen.getByText(/Laufen – Laktat, Januar/)).toBeVisible();
    expect(screen.getByText(/Laufen – Laktat, März/)).toBeVisible();
  });

  it('marks the test being looked at', () => {
    render(<MeasurementChart groups={[group()]} />);

    expect(screen.getByText(/dieser Test/)).toBeVisible();
  });

  it('gives each curve a shape of its own, not colour alone', () => {
    // The design system is explicit: colour never carries meaning by itself.
    // Two series must differ in more than their palette entry.
    render(<MeasurementChart groups={[group()]} />);

    const swatches = [...document.querySelectorAll('li span[aria-hidden]')].map(
      (node) => node.className,
    );

    expect(swatches).toHaveLength(2);
    expect(swatches[0]).not.toBe(swatches[1]);
    // Shape, not only colour: strip the palette and they must still differ.
    const shapeOnly = swatches.map((name) => name.replace(/(bg|border)-chart-\d/g, ''));
    expect(shapeOnly[0]).not.toBe(shapeOnly[1]);
  });

  it('stays reachable as data — the table above holds the numbers', () => {
    render(<MeasurementChart groups={[group()]} />);

    const figure = screen.getAllByRole('img')[0];

    expect(figure).toHaveAccessibleName(/Laktat/);
    expect(figure).toHaveAccessibleName(/Tabelle/);
  });

  it('keeps two quantities in two diagrams', () => {
    render(
      <MeasurementChart
        groups={[group(), group({ key: 'b', typeName: 'Herzfrequenz', unit: 'bpm' })]}
      />,
    );

    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('renders nothing at all when no test has more than one stage', () => {
    const { container } = render(<MeasurementChart groups={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('what the x axis is allowed to claim', () => {
  it('starts on the stage sequence where the protocol names no demand', () => {
    render(<MeasurementChart groups={[group()]} />);

    expect(screen.getByText(/x-Achse: Stufenfolge/)).toBeVisible();
    expect(screen.getByText(/nicht dieselbe Belastung/)).toBeVisible();
  });

  it('offers the quantities the tests actually recorded', () => {
    render(<MeasurementChart groups={[group()]} />);

    expect(screen.getByLabelText('x-Achse')).toBeVisible();
    expect(screen.getByRole('option', { name: 'Pace (km/h)' })).toBeInTheDocument();
  });

  it('says the points share a demand once a load axis is chosen', async () => {
    const user = userEvent.setup();
    render(<MeasurementChart groups={[group()]} />);

    await user.selectOptions(screen.getByLabelText('x-Achse'), 'mt_pace');

    expect(screen.getByText(/x-Achse: Pace in km\/h/)).toBeVisible();
    expect(screen.queryByText(/nicht dieselbe Belastung/)).toBeNull();
  });

  it('starts on the load the protocol named', () => {
    // A step test opens on speed rather than on stage numbers: that is the axis
    // its curves are actually comparable on.
    render(<MeasurementChart groups={[group({ defaultLoadId: 'mt_pace' })]} />);

    expect(screen.getByText(/x-Achse: Pace in km\/h/)).toBeVisible();
    expect(screen.getByLabelText('x-Achse')).toHaveValue('mt_pace');
  });

  it('offers no axis at all where no stage recorded a load', () => {
    render(<MeasurementChart groups={[group({ loadCandidates: [] })]} />);

    expect(screen.queryByLabelText('x-Achse')).toBeNull();
    expect(screen.getByText(/x-Achse: Stufenfolge/)).toBeVisible();
  });

  it('never calls a change good or bad', () => {
    render(<MeasurementChart groups={[group()]} />);

    const text = document.body.textContent ?? '';

    for (const word of [
      'verbessert',
      'verschlechtert',
      'besser',
      'schlechter',
      'Fortschritt',
      'positiv',
      'negativ',
      'Norm',
    ]) {
      expect(text, word).not.toContain(word);
    }
  });

  it('copes with a very long test name', () => {
    const long =
      'Laufen – Laktatstufentest auf dem Laufband mit erweitertem Protokoll für die Wettkampfvorbereitung';

    render(
      <MeasurementChart
        groups={[
          group({
            series: [{ ...group().series[0]!, moduleName: long }],
          }),
        ]}
      />,
    );

    expect(screen.getByText(new RegExp(long.slice(0, 30)))).toBeVisible();
  });
});
