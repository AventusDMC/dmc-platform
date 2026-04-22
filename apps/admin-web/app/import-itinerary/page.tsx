import { ImportItineraryClient } from './ImportItineraryClient';
const API_BASE_URL = '/api';

export default function ImportItineraryPage() {
  return (
    <main className="page">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">Itinerary Import</p>
          <h1 className="section-title">Paste text and extract structure</h1>
          <p className="detail-copy">
            This parses pasted itinerary text into editable days and items only. Nothing is saved automatically.
          </p>
        </div>

        <ImportItineraryClient apiBaseUrl={API_BASE_URL} />
      </section>
    </main>
  );
}
