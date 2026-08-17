import { readExerciseMedia } from '@apex/domain';

/**
 * The small preview beside a result row.
 *
 * **The placeholder is the normal case, not the error case.** Every exercise in
 * the catalogue carries `media: []` today — the wrkout dataset publishes
 * relative paths that the media schema rejects, and inventing a host name to
 * make them resolve was ruled out. So the empty state has to look deliberate,
 * not broken.
 *
 * It shows the first letter of the German name on a tinted square. That gives a
 * scanning eye something to anchor on and makes two adjacent rows visually
 * distinct, without pretending to be a picture. Name and description stay the
 * primary information; this is a landmark, not content.
 *
 * `readExerciseMedia` parses defensively and returns `[]` on anything it cannot
 * read, so a malformed value renders the placeholder rather than a broken image
 * icon. Only `image` is rendered — a video needs a player, which is a different
 * decision than this one.
 */
export function ExerciseThumbnail({
  name,
  media,
}: {
  readonly name: string;
  readonly media?: unknown;
}) {
  const items = readExerciseMedia(media);
  const image = items.find((item) => item.kind === 'image');

  if (image === undefined) {
    return (
      <span
        aria-hidden="true"
        data-testid="thumbnail-placeholder"
        className="grid size-11 shrink-0 place-items-center rounded-md border border-border bg-muted text-sm font-medium text-muted-foreground"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    // Plain `img`: the source is catalogue data of unknown dimensions, and
    // next/image wants a configured remote host — which is the very decision
    // that is still open. `alt` falls back to the name so the row stays
    // readable without images.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url}
      alt={image.alt ?? name}
      loading="lazy"
      className="size-11 shrink-0 rounded-md border border-border object-cover"
    />
  );
}
