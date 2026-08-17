import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Global test setup.
 *
 * `SKIP_ENV_VALIDATION` is set here because tests must not require a real
 * database URL or auth secret to run — the env schema is validated at build
 * time, which is where a misconfiguration should surface.
 *
 * ## Component tests
 *
 * `@testing-library/jest-dom/vitest` registers the DOM matchers, so a test can
 * say `toBeVisible()` and `toHaveAccessibleName()` instead of reaching into
 * `element.style` or `textContent`. The matchers assert what a user perceives,
 * which is the whole reason to render a component rather than call it.
 *
 * The `cleanup` after each test unmounts what was rendered. Without it, every
 * `getByRole` after the first test searches a document holding every previous
 * render — the queries then fail with "found multiple elements" in a way that
 * points at the wrong test.
 */
process.env['SKIP_ENV_VALIDATION'] = '1';
process.env['NEXT_PUBLIC_APP_URL'] ??= 'http://localhost:3000';

afterEach(() => {
  cleanup();
});
