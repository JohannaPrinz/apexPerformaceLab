import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  SelfComparison,
  type SelfComparisonRowView,
  type SelfComparisonView,
} from './self-comparison';

/**
 * What the comparison is allowed to put on screen.
 *
 * The tests that matter are the ones about restraint: that a difference never
 * acquires an adjective, that a best value never appears without a declared
 * direction, and that a test carried out under other conditions is named rather
 * than silently left out.
 */

const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

const row = (over: Partial<SelfComparisonRowView> = {}): SelfComparisonRowView => ({
  key: 'series_1',
  typeName: 'Dauer',
  unit: 's',
  side: 'BILATERAL',
  exerciseName: null,
  passIndex: null,
  context: {},
  current: { value: 278, capturedAt: day('2026-03-12') },
  previous: { value: 289, capturedAt: day('2026-02-02') },
  difference: -11,
  highest: { value: 301, capturedAt: day('2026-01-05') },
  lowest: { value: 278, capturedAt: day('2026-03-12') },
  best: null,
  count: 3,
  ...over,
});

const view = (over: Partial<SelfComparisonView> = {}): SelfComparisonView => ({
  protocol: { key: '1km_bahn_frisch', distanceM: 1000 },
  direction: null,
  rows: [row()],
  mismatchedProtocols: [],
  ...over,
});

const table = () => screen.getByRole('table');

describe('what it shows', () => {
  it('names the conditions the comparison rests on', () => {
    render(<SelfComparison comparison={view()} />);

    expect(screen.getByText('1km_bahn_frisch')).toBeInTheDocument();
    expect(screen.getByText(/1\.000 m/)).toBeInTheDocument();
  });

  it('says outright when a test declares no conditions', () => {
    render(<SelfComparison comparison={view({ protocol: null })} />);

    expect(screen.getByText(/keine Bedingungen hinterlegt/)).toBeInTheDocument();
  });

  it('shows the current value, the previous one and both dates', () => {
    render(<SelfComparison comparison={view()} />);

    const cells = within(table()).getAllByRole('cell');
    const text = cells.map((cell) => cell.textContent).join(' | ');

    expect(text).toContain('278 s');
    expect(text).toContain('12.03.2026');
    expect(text).toContain('289 s');
    expect(text).toContain('02.02.2026');
  });

  it('states the difference with its sign', () => {
    render(<SelfComparison comparison={view()} />);

    // A minus sign, not the word "besser" and not a colour.
    expect(within(table()).getByText('−11 s')).toBeInTheDocument();
  });

  it('says so plainly when this is the first test of its kind', () => {
    render(
      <SelfComparison
        comparison={view({ rows: [row({ previous: null, difference: null, count: 1 })] })}
      />,
    );

    expect(screen.getByText('Erster Test dieser Art')).toBeInTheDocument();
  });
});

describe('the extremes', () => {
  it('shows both, and no best value, where no direction was declared', () => {
    render(<SelfComparison comparison={view()} />);

    expect(screen.getByText('Höchster / niedrigster Wert der Serie')).toBeInTheDocument();
    expect(screen.getByText(/Für einen Bestwert fehlt die Angabe/)).toBeInTheDocument();
  });

  it('shows a best value once the coach has said which direction is the aim', () => {
    render(
      <SelfComparison
        comparison={view({
          direction: 'lower',
          rows: [row({ best: { value: 278, capturedAt: day('2026-03-12') } })],
        })}
      />,
    );

    expect(screen.getByText('Bestwert der Serie')).toBeInTheDocument();
    expect(screen.queryByText(/Für einen Bestwert fehlt/)).toBeNull();
  });
});

describe('what it never says', () => {
  it('uses no judgement anywhere on the screen', () => {
    render(
      <SelfComparison
        comparison={view({
          direction: 'lower',
          rows: [row({ best: { value: 278, capturedAt: day('2026-03-12') } })],
        })}
      />,
    );

    const text = document.body.textContent ?? '';

    for (const word of ['verbessert', 'verschlechtert', 'besser', 'schlechter', 'auffällig']) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });
});

describe('tests that were left out', () => {
  it('names them instead of dropping them silently', () => {
    render(
      <SelfComparison
        comparison={view({
          mismatchedProtocols: [
            { moduleId: 'mod_a', moduleName: '1 km Straße', protocolName: '1km_strasse' },
          ],
        })}
      />,
    );

    expect(screen.getByText(/unter anderen Bedingungen durchgeführt/)).toBeInTheDocument();
  });

  it('names an earlier test that declared nothing at all', () => {
    render(
      <SelfComparison
        comparison={view({
          mismatchedProtocols: [
            { moduleId: 'mod_a', moduleName: 'Alter Test', protocolName: null },
          ],
        })}
      />,
    );

    expect(screen.getByText(/ohne Angabe/)).toBeInTheDocument();
  });
});

describe('the coordinates of a row', () => {
  it('names the exercise, the side and the stage', () => {
    render(
      <SelfComparison
        comparison={view({
          rows: [row({ exerciseName: 'Kniebeuge', side: 'LEFT', passIndex: 3 })],
        })}
      />,
    );

    expect(screen.getByText(/Kniebeuge · Links · Stufe 3/)).toBeInTheDocument();
  });
});

describe('nothing to compare', () => {
  it('renders nothing at all rather than an empty table', () => {
    const { container } = render(<SelfComparison comparison={view({ rows: [] })} />);

    expect(container).toBeEmptyDOMElement();
  });
});
