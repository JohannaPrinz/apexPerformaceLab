/**
 * How old someone was on a given day.
 *
 * ## Age is never stored
 *
 * `dateOfBirth` is the only date the record keeps, and every age is derived
 * from it **at the moment it is needed**. A stored age is wrong the day after
 * it is written, and a body-fat calculation repeated a year later would then
 * silently use the age from the first run.
 *
 * The day that matters is the day of the measurement, not today: recalculating
 * an old test must reproduce the number it produced when it was taken. That is
 * why the reference day is an argument and not `new Date()`.
 *
 * ## What it does not do
 *
 * It does not invent an age where there is no date of birth — `dateOfBirth` is
 * optional on the Athlete and stays so. `null` means the calculation cannot be
 * performed, which the caller has to say out loud rather than substitute for.
 */
export function ageAt(dateOfBirth: Date | null, on: Date): number | null {
  if (dateOfBirth === null) return null;

  // Compared in UTC parts, not by subtracting timestamps: a difference in
  // milliseconds divided by a year length is off by a day around leap years and
  // around a birthday, and a body-density equation takes age as a whole number.
  const birthYear = dateOfBirth.getUTCFullYear();
  const birthMonth = dateOfBirth.getUTCMonth();
  const birthDay = dateOfBirth.getUTCDate();

  const year = on.getUTCFullYear();
  const month = on.getUTCMonth();
  const day = on.getUTCDate();

  const years =
    year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0);

  // A date of birth after the reference day is not an age of −3; it is a record
  // that cannot be right, and nothing may be calculated from it.
  return years < 0 ? null : years;
}
