import { expect, test, type Page } from '@playwright/test';

/**
 * The athlete's way in, end to end (§21).
 *
 * ## Why this journey and not another
 *
 * docs/TESTING.md reserves end-to-end tests for breaks that are unrecoverable.
 * This is the first of them: an athlete who cannot activate or cannot sign in
 * has no second route, no support screen and no way to tell anybody. Every
 * other portal guarantee — which rows they may read, what a deactivated account
 * may write — is asserted in unit tests against the procedures, which is faster
 * and does not need a browser.
 *
 * What is therefore checked here is only what a browser can break: the link
 * really arrives on the coach's screen, the page behind it really sets a
 * password, the password really signs in, the session really lands on the
 * athlete's own portal, a coach's route really refuses them, the link really
 * dies after one use, and signing out really ends it.
 *
 * ## What is deliberately absent
 *
 * **The password reset.** Its token only exists in a mailbox and in the
 * `verification` table; reaching either from a browser test would mean either a
 * mail server in CI or a database client in a spec, and both buy less than they
 * cost. The reset is covered by `features/auth/*` unit and component tests and
 * was walked through by hand — see the phase report.
 *
 * ## Why everything is built through the interface
 *
 * No seeding. A fixture that wrote rows straight into the database would test a
 * shape the product may not actually produce; the coach here signs up, creates
 * athletes and issues a link exactly as a person would.
 */

/** One run's worth of identities, so repeated runs never collide. */
const run = Date.now().toString(36);
const COACH = {
  name: 'QA Coach',
  email: `qa-coach-${run}@qa.invalid`,
  password: 'coach-passwort-2026',
};
const ATHLETE_A = { first: 'Anna', last: `Ahorn${run}`, email: `qa-a-${run}@qa.invalid` };
const ATHLETE_B = { first: 'Bea', last: `Birke${run}` };
const ATHLETE_PASSWORD = 'athleten-passwort-2026';

/** Signs a fresh coach up. Registration is what provisions the workspace. */
async function signUpCoach(page: Page): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill(COACH.name);
  await page.getByLabel('E-Mail').fill(COACH.email);
  await page.getByLabel('Passwort').fill(COACH.password);
  await page.getByRole('button', { name: 'Konto anlegen' }).click();
  await page.waitForURL('**/start', { timeout: 60_000 });
}

/** Creates one athlete through the roster dialog and lands on their record. */
async function createAthlete(
  page: Page,
  who: { first: string; last: string; email?: string },
): Promise<void> {
  await page.goto('/athletes');
  await page.getByRole('button', { name: 'Athlet anlegen' }).click();

  const form = page.getByRole('form', { name: 'Athletenstammdaten' });
  await form.getByLabel('Vorname').fill(who.first);
  await form.getByLabel('Nachname').fill(who.last);
  if (who.email !== undefined) await form.getByLabel('E-Mail').fill(who.email);

  await form.getByRole('button', { name: 'Athlet anlegen' }).click();
  await expect(page.getByRole('heading', { name: `${who.first} ${who.last}` })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('an athlete gets in', () => {
  let activationUrl = '';

  test('a coach issues a personal access link', async ({ page }) => {
    await signUpCoach(page);
    await createAthlete(page, ATHLETE_B);
    await createAthlete(page, ATHLETE_A);

    // The access panel sits under the master data, which the record keeps
    // folded away — the address is there, and the address is what a link needs.
    await page.getByRole('heading', { name: 'Stammdaten' }).click();
    await page.getByRole('button', { name: 'Zugangslink senden' }).click();

    // The link is shown to the coach as well as mailed — a workspace whose mail
    // is refused must still be able to hand it over.
    const shown = page.getByText(/\/zugang\//u).first();
    await expect(shown).toBeVisible({ timeout: 30_000 });
    activationUrl = (await shown.innerText()).trim();

    expect(activationUrl).toContain('/zugang/');
  });

  test('the link sets a password and hands over to sign-in', async ({ browser }) => {
    // A fresh context: the athlete is not the coach, and the coach's cookie
    // must play no part in what the link does.
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(activationUrl);
    await expect(page.getByRole('heading', { name: `Hallo ${ATHLETE_A.first}` })).toBeVisible();

    /**
     * By type and order rather than by label.
     *
     * docs/TESTING.md asks for role and accessible name, and this is the one
     * place it does not work: the activation form's first label wraps its own
     * hint, so the field's accessible name is "Passwort Mindestens 12 Zeichen.
     * Ihr Coach sieht es nicht." — which also means a screen reader announces
     * the hint as the name. Worth fixing in the markup; not worth changing
     * product markup from inside a test.
     */
    const fields = page.locator('input[type="password"]');
    await fields.first().fill(ATHLETE_PASSWORD);
    await fields.nth(1).fill(ATHLETE_PASSWORD);
    await page.getByRole('button', { name: 'Passwort festlegen' }).click();

    await expect(page.getByRole('heading', { name: 'Zugang eingerichtet' })).toBeVisible();
    await context.close();
  });

  test('the same link cannot be used a second time', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(activationUrl);

    // One sentence, and it says what to do next rather than "invalid token".
    await expect(page.getByRole('heading', { name: 'Dieser Link öffnet nicht' })).toBeVisible();
    await expect(page.getByText(/bereits verwendet/iu)).toBeVisible();
    await context.close();
  });

  test('signing in lands on the athlete’s own portal', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/sign-in');
    await page.getByLabel('E-Mail').fill(ATHLETE_A.email);
    await page.getByLabel('Passwort').fill(ATHLETE_PASSWORD);
    await page.getByRole('button', { name: 'Anmelden' }).click();

    // `/start` sends an account with no coach profile to the portal.
    await page.waitForURL('**/portal', { timeout: 60_000 });
    await expect(page.getByText('Athletenbereich')).toBeVisible();
    await expect(page.getByText(`${ATHLETE_A.first} ${ATHLETE_A.last}`).first()).toBeVisible();

    // Nobody else's record is on the screen.
    await expect(page.getByText(ATHLETE_B.last)).toHaveCount(0);
    await context.close();
  });

  test('a coach’s route refuses the athlete', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/sign-in');
    await page.getByLabel('E-Mail').fill(ATHLETE_A.email);
    await page.getByLabel('Passwort').fill(ATHLETE_PASSWORD);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.waitForURL('**/portal', { timeout: 60_000 });

    // The roster is a coach's surface. Asking for it by hand shows none — the
    // procedures behind it refuse an account with no coach profile, and the
    // shell sends them home rather than to an error page.
    await page.goto('/athletes');
    await expect(page).toHaveURL(/\/portal/u);
    await expect(page.getByRole('heading', { name: 'Athleten', exact: true })).toHaveCount(0);
    await expect(page.getByText(ATHLETE_B.last)).toHaveCount(0);

    await context.close();
  });

  test('signing out ends the session', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/sign-in');
    await page.getByLabel('E-Mail').fill(ATHLETE_A.email);
    await page.getByLabel('Passwort').fill(ATHLETE_PASSWORD);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.waitForURL('**/portal', { timeout: 60_000 });

    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.waitForURL(/\/sign-in/u, { timeout: 60_000 });

    // And the portal is closed to the browser that just left it.
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/sign-in/u);

    await context.close();
  });
});
