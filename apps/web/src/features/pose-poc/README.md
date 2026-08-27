# pose-poc — technische Erprobung, kein Feature

Beantwortet **eine** Frage: Läuft Pose-Erkennung im Browser auf einem
Android-Tablet flüssig genug, um sie einem Athleten live zu zeigen?

Alles läuft lokal. Es wird nichts übertragen, nichts gespeichert und nichts
bewertet. Diese Insel kennt weder Assessment noch Athlet noch Messwert.

## Was hier liegt

| Datei             | Zweck                                          |
| ----------------- | ---------------------------------------------- |
| `pose-camera.tsx` | Kamera, Skelett-Overlay, Kennzahlen, Messwerte |

Dazu die Route `app/(poc)/poc/pose/`.

**Winkel und Wiederholungszählung liegen nicht mehr hier.** Sie sind nach
`@apex/domain` (`src/movement`) gewandert, als die Videoanalyse dieselbe Logik
brauchte — eine zweite Kopie hätte irgendwann anders gezählt als die erste.
Diese Insel ist damit nur noch die Kamera-Erprobung.

## Entfernen

1. `apps/web/src/features/pose-poc/` löschen
2. `apps/web/src/app/(poc)/` löschen
3. In `apps/web/next.config.ts` den `/poc/:path*`-Eintrag aus `headers()` entfernen

`@mediapipe/tasks-vision` **bleibt** — die Videoanalyse in `features/movement`
benutzt es produktiv. `@apex/domain/src/movement` bleibt ebenfalls.

## Entscheidungen, die beim Übernehmen ins Produkt zu treffen sind

- **Permissions-Policy.** Die App setzt global `camera=()`. Für `/poc` ist das
  auf `camera=(self)` gelockert — auf den Produktpfad muss das bewusst
  ausgeweitet werden, nicht versehentlich.
- **Modell und WASM kommen von einem CDN.** Für eine Erprobung in Ordnung, für
  ein Produkt nicht: offline unbenutzbar und eine fremde Laufzeitabhängigkeit.
  Beides gehört dann nach `public/`.
- **Kein Web Worker.** `detectForVideo` nimmt ein `HTMLVideoElement`, das keine
  Worker-Grenze überquert. Ein Wechsel bedeutet `OffscreenCanvas`,
  `ImageBitmap`-Transfer und eine zweite WASM-Instanz. Die Anzeige trennt
  Inferenzzeit von Bildrate, damit die Messung entscheidet und nicht die
  Vermutung.
- **Winkel in 2D mit Seitenverhältnis-Korrektur.** Normalisierte Landmarks sind
  auf den Bildrahmen bezogen, nicht auf ein Quadrat; ohne Korrektur ist jeder
  diagonale Winkel falsch. Der 3D-Wert steht zum Vergleich daneben.
