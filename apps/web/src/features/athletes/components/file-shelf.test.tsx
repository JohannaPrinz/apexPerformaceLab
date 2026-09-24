import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileShelf, LOOSE_FILES, type ShelfFile, type ShelfFolder } from './file-shelf';

import type { WriteOutcome } from './writes';

/**
 * One athlete's files, as folders and what is in them (§18).
 *
 * The same component is the coach's page and the athlete's portal, so what is
 * asserted here holds for both doors: the tiles say what a folder is and who
 * made it, a folder opens to its own files and no others, putting something
 * here is a dialog behind one "Neu", and nothing is thrown away without being
 * asked. The read-only case is the deactivated portal account (§21).
 */

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/athletes/ath_1/dateien',
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
}));

const FOLDERS: ShelfFolder[] = [
  {
    id: 'fol_form',
    name: 'Formcheck',
    description: 'Kniebeuge und Kreuzheben, seitlich gefilmt.',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
    createdByName: 'Johanna Prinz',
  },
  {
    id: 'fol_own',
    name: 'Eigene Aufnahmen',
    description: null,
    createdAt: new Date('2026-09-07T10:00:00.000Z'),
    createdByName: null,
  },
];

const file = (over: Partial<ShelfFile>): ShelfFile => ({
  id: 'as_1',
  kind: 'DOCUMENT',
  fileName: 'befund.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 240_000,
  createdAt: new Date('2026-09-06T10:00:00.000Z'),
  folderId: 'fol_form',
  uploadedByCoachId: 'coach_1',
  storageKey: 'athletes/ath_1/befund.pdf',
  ...over,
});

const FILES: ShelfFile[] = [
  file({ id: 'as_pdf' }),
  file({
    id: 'as_video',
    kind: 'VIDEO',
    fileName: 'squat.mp4',
    mimeType: 'video/mp4',
    storageKey: 'athletes/ath_1/squat.mp4',
    uploadedByCoachId: null,
  }),
  file({ id: 'as_loose', fileName: 'loose.jpg', mimeType: 'image/jpeg', folderId: null }),
];

/** Every write, as a spy that succeeds unless a test says otherwise. */
const writes = () => ({
  analyseHref: vi.fn((assetId: string) => `/videoanalyse?asset=${assetId}`) as
    ((assetId: string) => string) | undefined,
  upload: vi.fn((): Promise<WriteOutcome> => Promise.resolve({})),
  createTicket: vi.fn((): Promise<{ ticket?: string; message?: string }> => Promise.resolve({})),
  registerUpload: vi.fn((): Promise<WriteOutcome> => Promise.resolve({})),
  createFolder: vi.fn((): Promise<WriteOutcome> => Promise.resolve({})),
  renameFolder: vi.fn((): Promise<WriteOutcome> => Promise.resolve({})),
  deleteFolder: vi.fn((): Promise<WriteOutcome> => Promise.resolve({})),
  deleteFile: vi.fn((): Promise<WriteOutcome> => Promise.resolve({})),
});

beforeEach(() => {
  replace.mockClear();
});

describe('the overview', () => {
  it('shows each folder as a tile with its name, date, author and description', () => {
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} />);

    const tile = screen.getByRole('link', { name: 'Ordner öffnen: Formcheck' }).parentElement!;
    const said = tile.textContent ?? '';

    expect(said).toContain('Formcheck');
    expect(said).toContain('Kniebeuge und Kreuzheben');
    expect(said).toContain('Angelegt am 05.09.2026');
    expect(said).toContain('von Johanna Prinz');
    expect(said).toContain('2 Dateien');
  });

  it('says the athlete made a folder where no coach did, and shows no empty description', () => {
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} />);

    const tile = screen.getByRole('link', {
      name: 'Ordner öffnen: Eigene Aufnahmen',
    }).parentElement!;

    expect(tile.textContent).toContain('vom Athleten');
    expect(tile.textContent).toContain('0 Dateien');
    expect(within(tile).queryAllByRole('paragraph')).toEqual([]);
  });

  it('lays the tiles out four abreast on a wide screen', () => {
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} />);

    expect(screen.getByRole('list', { name: 'Ordner' }).className).toContain('lg:grid-cols-4');
  });

  it('opens a folder through the address', () => {
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} />);

    expect(screen.getByRole('link', { name: 'Ordner öffnen: Formcheck' })).toHaveAttribute(
      'href',
      '/athletes/ath_1/dateien?ordner=fol_form',
    );
  });

  it('gathers unfiled files under a tile of their own, and only when there are some', () => {
    const { unmount } = render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} />);

    expect(screen.getByRole('link', { name: 'Ordner öffnen: Ohne Ordner' })).toHaveAttribute(
      'href',
      `/athletes/ath_1/dateien?ordner=${LOOSE_FILES}`,
    );
    unmount();

    render(
      <FileShelf
        folders={FOLDERS}
        files={FILES.filter((entry) => entry.folderId !== null)}
        writes={writes()}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Ordner öffnen: Ohne Ordner' })).toBeNull();
  });

  it('keeps the upload form off the page until somebody asks for it', () => {
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} />);

    expect(screen.queryByLabelText('Datei')).toBeNull();
    expect(screen.getByRole('button', { name: 'Neu' })).toBeVisible();
  });
});

describe('putting something here', () => {
  it('asks first whether it is a folder or a file', async () => {
    const user = userEvent.setup();
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} />);

    await user.click(screen.getByRole('button', { name: 'Neu' }));

    const dialog = screen.getByRole('dialog', { name: 'Neu anlegen' });
    expect(within(dialog).getByRole('button', { name: /Ordner/u })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: /Datei/u })).toBeVisible();
  });

  it('creates a folder with a name and a description', async () => {
    const user = userEvent.setup();
    const bound = writes();
    render(<FileShelf folders={FOLDERS} files={FILES} writes={bound} />);

    await user.click(screen.getByRole('button', { name: 'Neu' }));
    await user.click(screen.getByRole('button', { name: /Ordner/u }));
    await user.type(screen.getByLabelText('Name'), 'Befunde');
    await user.type(screen.getByLabelText(/Beschreibung/u), 'Arztbriefe und MRT');
    await user.click(screen.getByRole('button', { name: 'Ordner anlegen' }));

    expect(bound.createFolder).toHaveBeenCalledWith('Befunde', 'Arztbriefe und MRT');
    expect(await screen.findByRole('button', { name: 'Neu' })).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dialog open and says why when the folder cannot be made', async () => {
    const user = userEvent.setup();
    const bound = writes();
    bound.createFolder.mockResolvedValue({ message: 'Diesen Ordner gibt es bereits.' });
    render(<FileShelf folders={FOLDERS} files={FILES} writes={bound} />);

    await user.click(screen.getByRole('button', { name: 'Neu' }));
    await user.click(screen.getByRole('button', { name: /Ordner/u }));
    await user.type(screen.getByLabelText('Name'), 'Formcheck');
    await user.click(screen.getByRole('button', { name: 'Ordner anlegen' }));

    expect((await screen.findByRole('alert')).textContent).toContain('bereits');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('files an upload into the folder that is open', async () => {
    const user = userEvent.setup();
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} openFolderId="fol_form" />);

    await user.click(screen.getByRole('button', { name: 'Neu' }));
    await user.click(screen.getByRole('button', { name: /Datei/u }));

    expect(screen.getByLabelText('Ordner')).toHaveValue('fol_form');
  });
});

describe('an open folder', () => {
  it('shows its own files and no others', () => {
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} openFolderId="fol_form" />);

    const list = screen.getByRole('list', { name: 'Dateien' });
    expect(within(list).getByText('befund.pdf')).toBeVisible();
    expect(within(list).getByText('squat.mp4')).toBeVisible();
    expect(within(list).queryByText('loose.jpg')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Formcheck' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Alle Ordner' })).toHaveAttribute(
      'href',
      '/athletes/ath_1/dateien',
    );
  });

  it('offers a download for every file and an analysis for videos only', () => {
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} openFolderId="fol_form" />);

    expect(screen.getAllByRole('link', { name: 'Herunterladen' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Analysieren' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Analysieren' })).toHaveAttribute(
      'href',
      '/videoanalyse?asset=as_video',
    );
  });

  it('offers no analysis where the door binds none — the portal', () => {
    const bound = { ...writes(), analyseHref: undefined };
    render(<FileShelf folders={FOLDERS} files={FILES} writes={bound} openFolderId="fol_form" />);

    expect(screen.queryByRole('link', { name: 'Analysieren' })).toBeNull();
  });

  it('asks before a file is deleted for good', async () => {
    const user = userEvent.setup();
    const bound = writes();
    render(<FileShelf folders={FOLDERS} files={FILES} writes={bound} openFolderId="fol_form" />);

    await user.click(screen.getByRole('button', { name: 'befund.pdf löschen' }));
    expect(bound.deleteFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    expect(bound.deleteFile).toHaveBeenCalledWith('as_pdf');
  });

  it('removes a folder only after asking, and returns to the overview', async () => {
    const user = userEvent.setup();
    const bound = writes();
    render(<FileShelf folders={FOLDERS} files={FILES} writes={bound} openFolderId="fol_form" />);

    await user.click(screen.getByRole('button', { name: 'Ordner entfernen' }));
    // The question says the files survive — the answer a cautious person needs.
    expect(screen.getByRole('dialog').textContent).toContain('nicht gelöscht');

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Ordner entfernen' }),
    );

    expect(bound.deleteFolder).toHaveBeenCalledWith('fol_form');
    expect(replace).toHaveBeenCalledWith('/athletes/ath_1/dateien');
  });

  it('edits the name and the description in one dialog', async () => {
    const user = userEvent.setup();
    const bound = writes();
    render(<FileShelf folders={FOLDERS} files={FILES} writes={bound} openFolderId="fol_form" />);

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Formcheck');

    await user.clear(name);
    await user.type(name, 'Formcheck Herbst');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(bound.renameFolder).toHaveBeenCalledWith(
      'fol_form',
      'Formcheck Herbst',
      'Kniebeuge und Kreuzheben, seitlich gefilmt.',
    );
  });

  it('opens the unfiled files the same way', () => {
    render(
      <FileShelf folders={FOLDERS} files={FILES} writes={writes()} openFolderId={LOOSE_FILES} />,
    );

    expect(screen.getByRole('heading', { name: 'Ohne Ordner' })).toBeVisible();
    expect(screen.getByText('loose.jpg')).toBeVisible();
    // Not a folder anybody made, so there is nothing to rename or remove.
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
  });

  it('falls back to the overview for a folder that is not there', () => {
    render(<FileShelf folders={FOLDERS} files={FILES} writes={writes()} openFolderId="fol_gone" />);

    expect(screen.getByRole('list', { name: 'Ordner' })).toBeVisible();
  });
});

describe('a deactivated portal account', () => {
  it('still reads and downloads, and changes nothing', () => {
    render(
      <FileShelf
        folders={FOLDERS}
        files={FILES}
        writes={{ ...writes(), analyseHref: undefined }}
        openFolderId="fol_form"
        readOnly
      />,
    );

    expect(screen.getAllByRole('link', { name: 'Herunterladen' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Neu' })).toBeNull();
    expect(screen.queryByRole('button', { name: /löschen/u })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ordner entfernen' })).toBeNull();
  });
});
