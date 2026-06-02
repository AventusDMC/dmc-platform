'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type DragItem =
  | { type: 'day'; dayId: string }
  | { type: 'component'; componentId: string; dayId: string };

type DnDContextValue = {
  apiBaseUrl: string;
  packageTemplateId: string;
  orderedDayIds: string[];
  dragRef: { current: DragItem | null };
  busy: boolean;
  error: string;
  dropDay: (targetDayId: string) => void;
  dropComponentOnRow: (targetDayId: string, targetDayNumber: number, targetComponentId: string, orderedComponentIds: string[]) => void;
  dropComponentOnDay: (targetDayId: string, targetDayNumber: number) => void;
};

const DnDContext = createContext<DnDContextValue | null>(null);

function moveBefore(ids: string[], sourceId: string, targetId: string) {
  const without = ids.filter((id) => id !== sourceId);
  const index = without.indexOf(targetId);
  if (index < 0) {
    return [...ids];
  }
  without.splice(index, 0, sourceId);
  return without;
}

export function ItineraryDnDProvider({
  apiBaseUrl,
  packageTemplateId,
  orderedDayIds,
  children,
}: {
  apiBaseUrl: string;
  packageTemplateId: string;
  orderedDayIds: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const dragRef = useRef<DragItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(url: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not reorder the itinerary.'));
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not reorder the itinerary.');
    } finally {
      dragRef.current = null;
      setBusy(false);
    }
  }

  function dropDay(targetDayId: string) {
    const dragged = dragRef.current;
    if (!dragged || dragged.type !== 'day' || dragged.dayId === targetDayId) {
      return;
    }
    const next = moveBefore(orderedDayIds, dragged.dayId, targetDayId);
    void send(`${apiBaseUrl}/package-templates/${packageTemplateId}/days/reorder`, { orderedDayIds: next });
  }

  function dropComponentOnRow(targetDayId: string, targetDayNumber: number, targetComponentId: string, orderedComponentIds: string[]) {
    const dragged = dragRef.current;
    if (!dragged || dragged.type !== 'component' || dragged.componentId === targetComponentId) {
      return;
    }
    if (dragged.dayId === targetDayId) {
      const next = moveBefore(orderedComponentIds, dragged.componentId, targetComponentId);
      void send(`${apiBaseUrl}/package-templates/${packageTemplateId}/days/${targetDayId}/components/reorder`, { orderedComponentIds: next });
      return;
    }
    void send(`${apiBaseUrl}/package-templates/${packageTemplateId}/components/${dragged.componentId}/move`, { dayNumber: targetDayNumber });
  }

  function dropComponentOnDay(targetDayId: string, targetDayNumber: number) {
    const dragged = dragRef.current;
    if (!dragged || dragged.type !== 'component' || dragged.dayId === targetDayId) {
      return;
    }
    void send(`${apiBaseUrl}/package-templates/${packageTemplateId}/components/${dragged.componentId}/move`, { dayNumber: targetDayNumber });
  }

  return (
    <DnDContext.Provider
      value={{ apiBaseUrl, packageTemplateId, orderedDayIds, dragRef, busy, error, dropDay, dropComponentOnRow, dropComponentOnDay }}
    >
      {error ? <p className="form-error">{error}</p> : null}
      {children}
    </DnDContext.Provider>
  );
}

function useDnD() {
  return useContext(DnDContext);
}

export function DayDragZone({ dayId, dayNumber, children }: { dayId: string; dayNumber: number; children: ReactNode }) {
  const dnd = useDnD();
  const [over, setOver] = useState(false);
  if (!dnd) {
    return <>{children}</>;
  }

  return (
    <div
      className={over ? 'dnd-zone dnd-zone-over' : 'dnd-zone'}
      onDragOver={(event) => {
        if (dnd.dragRef.current) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const dragged = dnd.dragRef.current;
        if (dragged?.type === 'day') {
          dnd.dropDay(dayId);
        } else if (dragged?.type === 'component') {
          dnd.dropComponentOnDay(dayId, dayNumber);
        }
      }}
    >
      {children}
    </div>
  );
}

export function DayDragHandle({ dayId }: { dayId: string }) {
  const dnd = useDnD();
  if (!dnd) {
    return null;
  }
  return (
    <span
      className="dnd-handle"
      role="button"
      aria-label="Drag to reorder day"
      title="Drag to reorder day"
      draggable
      onClick={(event) => event.stopPropagation()}
      onDragStart={() => {
        dnd.dragRef.current = { type: 'day', dayId };
      }}
      onDragEnd={() => {
        dnd.dragRef.current = null;
      }}
    >
      ⠿
    </span>
  );
}

export function ComponentDragRow({
  componentId,
  dayId,
  dayNumber,
  orderedComponentIds,
  className,
  children,
}: {
  componentId: string;
  dayId: string;
  dayNumber: number;
  orderedComponentIds: string[];
  className?: string;
  children: ReactNode;
}) {
  const dnd = useDnD();
  const [over, setOver] = useState(false);
  if (!dnd) {
    return <tr className={className}>{children}</tr>;
  }

  const rowClass = [className, over ? 'dnd-row-over' : null].filter(Boolean).join(' ') || undefined;

  return (
    <tr
      className={rowClass}
      draggable
      onDragStart={(event) => {
        dnd.dragRef.current = { type: 'component', componentId, dayId };
        event.stopPropagation();
      }}
      onDragEnd={() => {
        dnd.dragRef.current = null;
      }}
      onDragOver={(event) => {
        if (dnd.dragRef.current?.type === 'component') {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        dnd.dropComponentOnRow(dayId, dayNumber, componentId, orderedComponentIds);
      }}
    >
      {children}
    </tr>
  );
}
