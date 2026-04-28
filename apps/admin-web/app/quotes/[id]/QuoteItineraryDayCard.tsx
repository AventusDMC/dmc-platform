import { ReactNode } from 'react';

type QuoteItineraryDayCardProps = {
  dayNumber: number;
  title: string;
  notes: string | null;
  status: ReactNode;
  summary: Array<{
    label: string;
    value: ReactNode;
  }>;
  moveActions?: ReactNode;
  editor?: ReactNode;
  assignService?: ReactNode;
  services?: ReactNode;
};

export function QuoteItineraryDayCard({
  dayNumber,
  title,
  notes,
  status,
  summary,
  moveActions,
  editor,
  assignService,
  services,
}: QuoteItineraryDayCardProps) {
  return (
    <article className="quote-itinerary-day-card">
      <header className="quote-itinerary-day-head">
        <div className="quote-itinerary-day-title">
          <span className="quote-itinerary-day-number">Day {dayNumber}</span>
          <div>
            <h3>{title}</h3>
            {notes?.trim() ? <p>{notes}</p> : null}
          </div>
        </div>
        <div className="quote-itinerary-day-actions">
          {status}
          {moveActions ? <div className="quote-itinerary-day-moves">{moveActions}</div> : null}
        </div>
      </header>
      <div className="quote-itinerary-day-summary">
        {summary.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {editor ? <div className="quote-itinerary-day-panel">{editor}</div> : null}
      {assignService ? <div className="quote-itinerary-day-panel">{assignService}</div> : null}
      <div className="quote-itinerary-day-panel">
        <div className="quote-itinerary-day-panel-head">
          <div>
            <p className="eyebrow">Services</p>
            <h4>Linked service rows</h4>
          </div>
        </div>
        {services}
      </div>
    </article>
  );
}
