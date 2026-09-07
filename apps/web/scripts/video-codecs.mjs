/**
 * What the browsers on this machine will actually encode (§18).
 *
 * The compression plan is unit-tested in Node with an injected encoder, because
 * Node has no codecs and a fake one would only test the fake. This is the other
 * half: it asks real browsers what they support, and then makes one real video
 * to prove the answer was not just a claim.
 *
 * Run it when the encoding path changes, or to check a new browser version:
 *
 *   node apps/web/scripts/video-codecs.mjs
 *
 * A browser Playwright has not downloaded is reported and skipped rather than
 * failing the run — the point is to find out what is available, not to insist.
 */
import { chromium, firefox, webkit } from 'playwright';

/** The same list `compress-video.ts` asks for, best first. */
const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=h264',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/**
 * Records a short canvas animation, which is the same mechanism the app uses to
 * compress. If this produces bytes, the encoding path works in this browser.
 */
const RECORD = async (candidates) => {
  const support = {};
  for (const type of candidates) {
    try {
      support[type] = MediaRecorder.isTypeSupported(type);
    } catch {
      support[type] = false;
    }
  }

  const chosen = candidates.find((type) => support[type]) ?? null;
  if (chosen === null) return { support, chosen, produced: null };

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  const stream = canvas.captureStream(30);

  const recorder = new MediaRecorder(stream, {
    mimeType: chosen,
    videoBitsPerSecond: 1_500_000,
  });

  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  recorder.start(200);

  await new Promise((resolve) => {
    let frame = 0;
    const draw = () => {
      // Noise rather than a flat colour: a still image compresses to nothing
      // and would prove that the encoder ran, not that it encodes.
      const image = context.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = (Math.random() * 255) | 0;
        image.data[i + 1] = (frame * 7) % 255;
        image.data[i + 2] = (Math.random() * 255) | 0;
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);

      if (++frame >= 60) resolve();
      else requestAnimationFrame(draw);
    };
    draw();
  });

  recorder.stop();
  await stopped;

  const blob = new Blob(chunks, { type: recorder.mimeType || chosen });
  const bytes = new Uint8Array(await blob.arrayBuffer());

  return {
    support,
    chosen,
    produced: {
      mimeType: blob.type,
      recorderMimeType: recorder.mimeType,
      sizeBytes: blob.size,
      audioTracks: stream.getAudioTracks().length,
      firstBytes: Array.from(bytes.slice(0, 12)),
    },
  };
};

const BROWSERS = [
  ['Chromium', chromium],
  ['Firefox', firefox],
  // Playwright's WebKit is the closest thing to Safari available off an Apple
  // device. It is not Safari, and a pass here is evidence, not a guarantee.
  ['WebKit (kein echtes Safari)', webkit],
];

for (const [name, type] of BROWSERS) {
  let browser;
  try {
    browser = await type.launch({ headless: true });
  } catch (error) {
    console.log(`\n${name}: nicht installiert — übersprungen`);
    console.log(`  (${String(error).split('\n')[0]})`);
    continue;
  }

  const page = await browser.newPage();
  await page.goto('about:blank');

  const result = await page.evaluate(RECORD, CANDIDATES);

  console.log(`\n${name}`);
  for (const candidate of CANDIDATES) {
    console.log(`  ${result.support[candidate] ? 'ja  ' : 'nein'} ${candidate}`);
  }
  console.log(`  gewählt:   ${result.chosen ?? '— keine Kompression möglich'}`);

  if (result.produced === null) {
    console.log('  erzeugt:   nichts — dieser Browser würde abgelehnt werden');
  } else {
    console.log(
      `  erzeugt:   ${result.produced.sizeBytes} Bytes als ${result.produced.mimeType}` +
        ` (Recorder meldet ${result.produced.recorderMimeType || '—'})`,
    );
    console.log(`  Tonspuren: ${result.produced.audioTracks}`);
  }

  await browser.close();
}

console.log('\nHinweis: Safari auf iOS ist von hier aus nicht prüfbar.');
console.log(
  'Der Pfad dorthin ist erkennbar: MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")',
);
console.log('antwortet dort mit true, und der Recorder liefert dann echtes MP4/H.264.');
