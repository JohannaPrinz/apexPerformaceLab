/**
 * Global test setup.
 *
 * `SKIP_ENV_VALIDATION` is set here because tests must not require a real
 * database URL or auth secret to run — the env schema is validated at build
 * time, which is where a misconfiguration should surface.
 */
process.env['SKIP_ENV_VALIDATION'] = '1';
process.env['NEXT_PUBLIC_APP_URL'] ??= 'http://localhost:3000';

export {};
