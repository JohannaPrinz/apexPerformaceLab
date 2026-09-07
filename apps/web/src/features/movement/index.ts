/**
 * Public surface of the movement-analysis slice.
 *
 * The pure logic is **not** here: angles, repetition counting, ranges and the
 * mapping onto measurement types live in `@apex/domain` (`src/movement`), so the
 * uploaded-video path and a later live camera share one implementation rather
 * than two that drift. What this slice owns is the browser end — reading a file,
 * driving the model, and the screens around it.
 *
 * `server/actions.ts` stays private: it is a thin caller of
 * `measurements.recordMany`, and a second entry point would be a second
 * authorization path.
 */
export {
  VideoAnalysis,
  type AnalysisTarget,
  type StoredVideoSource,
} from './components/video-analysis';
export {
  analyseClip,
  aspectRatioOf,
  DEFAULT_SAMPLE_FPS,
  frameCountOf,
  type AnalysisProgress,
  type AnalysisRun,
  type FrameReader,
  type VideoClip,
} from './analysis/pipeline';
