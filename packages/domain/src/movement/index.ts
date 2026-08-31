/**
 * Movement analysis — angles, repetitions, ranges.
 *
 * Pure and React-free, so the same rules serve an uploaded video and a live
 * camera without either owning them. Nothing here reads a clock, touches a
 * database or knows what a measurement is; `plan.ts` is where the result meets
 * the existing measurement model, and even that only maps.
 */
export * from './analysis-config';
export * from './angles';
export * from './dynamics';
export * from './engine';
export * from './profile';
export * from './plan';
export * from './reps';
export * from './summary';
