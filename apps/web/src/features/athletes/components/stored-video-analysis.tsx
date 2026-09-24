'use client';

import { useMemo, useRef } from 'react';

import { VideoAnalysis, type AnalysisTarget } from '@/features/movement';

import {
  deleteAnalysedVideoAction,
  heartbeatAnalysisAction,
  releaseAnalysisSourceAction,
  startAnalysisAction,
} from '../server/file-actions';

/**
 * The existing analysis screen, pointed at a video the workspace already holds
 * (§18).
 *
 * ## Why the binding lives in this slice
 *
 * `VideoAnalysis` knows about videos, not about whose they are. Releasing the
 * hold on an asset and deleting one are acts on an **athlete's record**, so the
 * procedures for them belong to this slice — and binding them here keeps the
 * movement slice from having to know that assets exist at all.
 *
 * It is the same shape as `coachWrites` for the tracking tables and
 * `CoachFiles` for the shelf: one presentation, and the door bound around it.
 *
 * ## What the browser is given
 *
 * An asset id. The bytes come from `/api/assets/<id>/video`, which authorises
 * the request itself and resolves the storage key server-side — no path is ever
 * handed to the client, and none is accepted from it.
 */
export function StoredVideoAnalysis({
  target,
  stillsKept,
  athleteId,
  assetId,
  fileName,
  mimeType,
}: {
  readonly target: AnalysisTarget;
  readonly stillsKept: boolean;
  readonly athleteId: string;
  readonly assetId: string;
  readonly fileName: string;
  readonly mimeType: string;
}) {
  /**
   * One source object for as long as it names the same video.
   *
   * `VideoAnalysis` keys its effects on this — loading the video, releasing the
   * hold when it unmounts. A fresh object on every render would re-run both,
   * and Next re-renders this component after every Server Action: the video
   * would reload mid-analysis, and the unmount release would fire while the
   * screen was still open. So the identity is tied to what it describes.
   */
  /**
   * Whether *this* screen is the one holding the video.
   *
   * A screen that was refused the hold — because another coach is analysing the
   * same recording — must not end that other analysis when it gives up. Only
   * the screen that took the hold may release it, and only it should keep it
   * alive.
   */
  const held = useRef(false);

  const source = useMemo(
    () => ({
      assetId,
      fileName,
      load: async () => {
        /**
         * Take the hold first, and only then the bytes.
         *
         * This is the moment an analysis begins, so it is the moment the file
         * becomes undeletable. Doing it here rather than while the page renders
         * is what keeps a released hold released.
         */
        const started = await startAnalysisAction(athleteId, assetId);
        if (!started.ok) throw new Error(started.message);
        held.current = true;

        const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/video`);

        // One message for every refusal, because the route answers 404 to all
        // of them on purpose — see there.
        if (!response.ok) {
          throw new Error('Dieses Video steht nicht mehr zur Verfügung.');
        }

        return new File([await response.blob()], fileName, { type: mimeType });
      },
      release: async (outcome: 'FINISHED' | 'FAILED') => {
        // Nothing to end where nothing was taken — and ending somebody else's
        // analysis would be worse than doing nothing.
        if (!held.current) return;
        held.current = false;

        await releaseAnalysisSourceAction(athleteId, assetId, outcome);
      },
      heartbeat: async () => {
        if (!held.current) return;

        await heartbeatAnalysisAction(assetId);
      },
      // Not the shelf's delete: that one refreshes the page, and a refreshed
      // analysis page without its video discards the analysis on screen.
      remove: () => deleteAnalysedVideoAction(athleteId, assetId),
    }),
    [athleteId, assetId, fileName, mimeType],
  );

  return <VideoAnalysis target={target} stillsKept={stillsKept} source={source} />;
}
