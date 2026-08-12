import { z } from 'zod';

import { MODULE_CONFIGURATION_VERSION, type ModuleConfiguration } from './configuration';

/**
 * Validation for `Measurement.context`.
 *
 * The column is JSON, which would ordinarily mean "anything goes". It does not:
 * the permitted keys are exactly the dimensions the Module's configuration
 * declares, and the schema is derived by the **module definition for the
 * module's `moduleVersion`**. A measurement carrying a key the test never
 * declared is rejected before it reaches the database.
 *
 * Why derive rather than fix a vocabulary per module: naming joints, muscle
 * sites and body regions is a professional decision that has not been taken.
 * Deriving from the coach's own configuration validates strictly *today*
 * without inventing anatomy — and `measurementContextSchema` dispatches on
 * version, so a module that later ships a fixed vocabulary constrains its own
 * context without touching anything already recorded.
 *
 * Side is deliberately absent. It has a typed column and a fixed enum
 * (§12, §26.10); putting it here as well would create two places to look and
 * one of them would eventually be wrong.
 */

/** A context is a flat map of dimension key → chosen value. */
export type MeasurementContext = Record<string, string>;

/**
 * Builds the context schema for a module configuration.
 *
 * - a dimension with a declared value list accepts only those values
 * - a dimension without one accepts any non-empty string — the coach names the
 *   sites as they go
 * - every declared dimension is required: a value recorded without saying which
 *   joint it belongs to is not a partial record, it is an ambiguous one
 * - unknown keys are rejected outright
 *
 * A configuration with no dimensions produces a schema that accepts only an
 * empty object, so `context` on such a module is null or `{}` and never a place
 * where stray data accumulates.
 */
function contextSchemaV1(configuration: ModuleConfiguration): z.ZodType<MeasurementContext> {
  const shape: Record<string, z.ZodType<string>> = {};

  for (const dimension of configuration.dimensions) {
    shape[dimension.key] =
      dimension.values && dimension.values.length > 0
        ? z.enum(dimension.values as [string, ...string[]])
        : z.string().trim().min(1, `Please give a value for "${dimension.label}".`);
  }

  // `.strict()` is the whole point: an undeclared key is a mistake, not extra
  // information, and silently storing it would make the column exactly the
  // unvalidated JSON this design avoids.
  return z.object(shape).strict();
}

/**
 * The context schema a module definition prescribes for a given version.
 *
 * `moduleVersion` is recorded on `AssessmentModule`, so a measurement is always
 * validated against the shape its test was configured under — the same reason
 * the version is stored on the row rather than only in the registry (§16).
 */
export function measurementContextSchema(
  configuration: ModuleConfiguration,
  moduleVersion: number = MODULE_CONFIGURATION_VERSION,
): z.ZodType<MeasurementContext> {
  switch (moduleVersion) {
    // Versions 1 and 2 derive the context identically: version 2 added roles
    // and exercises, and neither is a context dimension. The exercise in
    // particular is a **typed reference on the Measurement**, not a JSON key —
    // which is what lets a foreign key refuse to delete a used exercise. Listing
    // the versions separately rather than defaulting keeps the next shape
    // change a deliberate decision instead of a silent inheritance.
    case 1:
    case 2:
      return contextSchemaV1(configuration);
    default:
      throw new Error(`No context schema defined for module version ${String(moduleVersion)}.`);
  }
}

export interface ContextValidationResult {
  readonly success: boolean;
  readonly context?: MeasurementContext;
  /** Dimension key → message, ready for a form. */
  readonly errors?: Record<string, string>;
}

/**
 * Validates a measurement's context against its module configuration.
 *
 * `null` and `undefined` are treated as an empty context, which is valid
 * precisely when the configuration declares no dimensions.
 */
export function validateMeasurementContext(
  configuration: ModuleConfiguration,
  context: unknown,
  moduleVersion: number = MODULE_CONFIGURATION_VERSION,
): ContextValidationResult {
  const parsed = measurementContextSchema(configuration, moduleVersion).safeParse(context ?? {});

  if (parsed.success) return { success: true, context: parsed.data };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = typeof issue.path[0] === 'string' ? issue.path[0] : '_';
    errors[key] ??= issue.message;
  }

  return { success: false, errors };
}

/**
 * Validates a pass number against the configuration.
 *
 * 1-based, and only meaningful when the module records more than one pass —
 * a single-pass module stores null rather than a constant 1, so "does this test
 * have passes" is answerable without reading the configuration.
 */
export function validatePassIndex(
  configuration: ModuleConfiguration,
  passIndex: number | null | undefined,
): boolean {
  if (configuration.passes <= 1) return passIndex === null || passIndex === undefined;

  return (
    typeof passIndex === 'number' &&
    Number.isInteger(passIndex) &&
    passIndex >= 1 &&
    passIndex <= configuration.passes
  );
}
