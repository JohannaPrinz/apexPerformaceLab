import { tendencyOf, type ReportSnapshot } from '@apex/domain';

import { documentFromSnapshot } from './document';
import { ReportDocument } from './report-document';

/**
 * A published analysis, as the athlete sees it.
 *
 * ## The same document, and deliberately so
 *
 * This used to be its own rendering, and it drifted from the coach's: different
 * columns, a different order, the coach's words at the bottom. A coach could not
 * tell what they were sending by looking at what they were editing.
 *
 * Now it is `ReportDocument` with nothing passed for `editing` — which is the
 * whole difference between the two sides. What the athlete cannot do is change
 * it; what they see is exactly what the coach saw.
 *
 * ## Read from the snapshot, never from the record
 *
 * Every number here was frozen at publication. A correction the coach enters
 * afterwards does not change this page — that is the point of §2: the document
 * an athlete was handed stays the document they were handed, and a later change
 * is a new version with a new link.
 *
 * The tendency is recomputed here rather than frozen as a word, because the
 * *direction* it derives from was frozen. Running the domain's own rule over it
 * is what makes this page and the coach's agree by construction.
 */
export function SharedReport({
  snapshot,
  token,
}: {
  readonly snapshot: ReportSnapshot;
  /**
   * The link this reader arrived by, where there is one.
   *
   * The athlete proves themselves with a cookie scoped to their own link, so
   * their pictures are served beneath it. The coach is signed in and reads the
   * very same document through the workspace route — which is why this is
   * optional rather than two components.
   */
  readonly token?: string;
}) {
  return (
    <ReportDocument
      view={documentFromSnapshot(
        snapshot,
        tendencyOf,
        token === undefined
          ? undefined
          : (key) => `/geteilt/${encodeURIComponent(token)}/bild/${key}`,
      )}
    />
  );
}
