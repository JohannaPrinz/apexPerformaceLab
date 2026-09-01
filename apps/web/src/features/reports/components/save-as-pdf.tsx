'use client';

import { Printer } from 'lucide-react';

import { Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

/**
 * Saving the analysis as a PDF.
 *
 * ## Why this is the browser's print dialog
 *
 * Every browser can already write this page to PDF, and it does it from the
 * layout the reader is looking at. A file produced some other way would be a
 * second rendering of the same document — and the first time the two disagreed,
 * neither would be trustworthy.
 *
 * The button says "speichern" rather than "drucken" because saving is what
 * almost everyone does with it; the dialog offers both either way.
 *
 * Hidden on paper, obviously: a button printed into a PDF is a joke at the
 * reader's expense.
 */
export function SaveAsPdf() {
  return (
    <Button
      type="button"
      variant="outline"
      className={`${TOUCH_BUTTON} print:hidden`}
      onClick={() => {
        window.print();
      }}
    >
      <Printer aria-hidden="true" className="size-4" />
      Als PDF speichern
    </Button>
  );
}
