import { z } from 'zod';

/**
 * Measurement input.
 *
 * As everywhere: no `organizationId`. The tenant comes from the session.
 *
 * **One `value`, not three columns.** The model holds `numericValue`,
 * `textValue` and `booleanValue` with a database CHECK that exactly one is set;
 * asking the client which column to fill would put that invariant in the hands
 * of every caller. The measurement type declares its `valueType`, and the
 * service maps the value to the right column — so violating the constraint is
 * not something a caller can express.
 */

export const measurementSourceSchema = z.enum(['MANUAL', 'DEVICE', 'IMPORT', 'DERIVED']);
export type MeasurementSourceInput = z.infer<typeof measurementSourceSchema>;

export const bodySideSchema = z.enum(['LEFT', 'RIGHT', 'BILATERAL']);
export type BodySideInput = z.infer<typeof bodySideSchema>;

export const recordMeasurementSchema = z.object({
  moduleId: z.string().min(1),
  measurementTypeId: z.string().min(1),
  /** Mapped to the column the type's `valueType` names. */
  value: z.union([z.number(), z.string(), z.boolean()]),
  side: bodySideSchema.default('BILATERAL'),
  /**
   * Which movement this value was taken during.
   *
   * Required exactly when the module's configuration declares exercises, and
   * refused when it declares none — validated in the service against that
   * configuration, never trusted from the request. An **id**, never a name: free
   * text would make the catalogue decorative and defeat the foreign key that
   * stops a used exercise being deleted.
   */
  exerciseId: z.string().min(1).nullish(),
  /** 1-based; required exactly when the module records several passes. */
  passIndex: z.number().int().min(1).nullish(),
  /** Validated against the dimensions the module's configuration declares. */
  context: z.record(z.string(), z.string()).nullish(),
  /** Defaults to now. Separate from ingestion, because devices deliver late. */
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  /** A remark about this one reading. General test remarks are a module note. */
  note: z.string().trim().max(2000).nullish(),
  source: measurementSourceSchema.default('MANUAL'),
  externalSystem: z.string().trim().max(80).nullish(),
  externalId: z.string().trim().max(200).nullish(),
});

export type RecordMeasurementInput = z.infer<typeof recordMeasurementSchema>;

/**
 * Correcting a measurement.
 *
 * A correction is a **new** measurement that supersedes the previous one; the
 * superseded value stays visible (§4, §13). There is deliberately no update
 * procedure — an erroneous reading is part of the scientific record, and
 * overwriting it would erase the fact that it was taken.
 */
export const correctMeasurementSchema = z.object({
  measurementId: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean()]),
  /** Left empty the replacement carries no note; the superseded row keeps its own. */
  note: z.string().trim().max(2000).nullish(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
});

/** A general remark about the test — stored as a Note on the module (§20). */
export const addModuleNoteSchema = z.object({
  moduleId: z.string().min(1),
  body: z.string().trim().min(1, 'Write something.').max(4000),
});

export type AddModuleNoteInput = z.infer<typeof addModuleNoteSchema>;

export type CorrectMeasurementInput = z.infer<typeof correctMeasurementSchema>;

export const moduleMeasurementsSchema = z.object({
  moduleId: z.string().min(1),
  /** Superseded values are hidden by default but never deleted. */
  includeSuperseded: z.boolean().default(false),
});

export type ModuleMeasurementsInput = z.infer<typeof moduleMeasurementsSchema>;
