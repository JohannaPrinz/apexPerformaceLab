'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogTrigger } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { AthleteForm } from './athlete-form';

/**
 * Creating an athlete without leaving the roster.
 *
 * The form itself is unchanged — the same component the `/athletes/new` route
 * renders, with the same schema, the same duplicate check and the same server
 * action. What changes is where it appears: the roster stays behind the dialog,
 * so a coach who was mid-search does not lose their place.
 *
 * `/athletes/new` stays reachable. It is the honest target for a bookmark or a
 * link from outside the app, and keeping it costs one route that already works.
 *
 * ## Why the dialog closes on navigation rather than on success
 *
 * `AthleteForm` navigates to the new athlete when it succeeds — that is its
 * behaviour on the route and it is the right one here too: a coach who just
 * entered someone almost always wants to open them. The dialog therefore has no
 * success branch to handle; the navigation unmounts it.
 *
 * The one case that needs care is the *duplicate warning*, which is not a
 * success: the action returns candidates, the form re-renders with them, and
 * the dialog must stay open. It does, because nothing here closes it.
 */
export function CreateAthleteDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A cancelled dialog leaves the roster as it was; a closed one after a
        // creation would show a stale list, so the data is refreshed either
        // way. Cheap, and it removes a class of "where is my athlete" report.
        if (!next) router.refresh();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="accent" className={TOUCH_BUTTON}>
          <Plus aria-hidden="true" className="size-4" />
          Athlet anlegen
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Athlet anlegen"
        description="Nur der Name wird benötigt. Kontaktdaten, Größe und Gewicht können später folgen."
      >
        <AthleteForm
          onCancel={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
