/**
 * Exercise catalogue research.
 *
 * Reads external datasets, compares them, and produces candidates for a curated
 * catalogue. **Nothing here writes to the product.**
 *
 * That is structural, not a convention: this package is not a dependency of
 * `apps/web` or `@apex/database`, so no code path leads from a downloaded
 * dataset into the Exercise table. What crosses the boundary is a curated
 * import file, written by a person, validated by `@apex/domain`.
 *
 * Raw downloads live under `artifacts/<source>/<date>/` and are not committed;
 * what belongs in the repository is the normalised comparison and the analysis
 * drawn from it.
 */
export * from './adapters';
export * from './candidates';
export * from './compare';
export * from './neutral';
export * from './sources';
