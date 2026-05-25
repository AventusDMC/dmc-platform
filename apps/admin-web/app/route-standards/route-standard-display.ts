// Frontend mirror of the backend computeRouteTimingConfidence helper, plus
// presentation metadata (color band + detail copy) so the table cell can
// render a consistent badge without re-running the logic in JSX.

export type TimingConfidenceLabel =
  | 'Normal Traffic'
  | 'Heavy Traffic Risk'
  | 'Mountain Road Delay Risk'
  | 'Border Delay Risk'
  | 'Long Distance Drive';

export type TimingConfidencePresentation = {
  label: TimingConfidenceLabel;
  bg: string;
  text: string;
  detail: string;
};

type TimingConfidenceInput = {
  longDistanceFlag?: boolean | null;
  overnightRisk?: boolean | null;
  mountainRoadFlag?: boolean | null;
  borderCrossingFlag?: boolean | null;
  airportRouteFlag?: boolean | null;
  standardDurationHours?: number | null;
};

// Priority order MUST match the backend helper in
// apps/api/src/route-standards/route-standards.service.ts so the
// frontend badge and the exported workbook show the same label.
function classify(input: TimingConfidenceInput): TimingConfidenceLabel {
  if (input.borderCrossingFlag) return 'Border Delay Risk';
  if (input.mountainRoadFlag) return 'Mountain Road Delay Risk';
  if (input.longDistanceFlag || (input.standardDurationHours ?? 0) >= 5) return 'Long Distance Drive';
  if (input.airportRouteFlag) return 'Heavy Traffic Risk';
  return 'Normal Traffic';
}

export function computeTimingConfidenceLabel(input: TimingConfidenceInput): TimingConfidencePresentation {
  const label = classify(input);
  switch (label) {
    case 'Border Delay Risk':
      return {
        label,
        bg: '#faf2f2',
        text: '#7a4242',
        detail: 'Border crossing adds 1-3 hours unpredictable wait. Schedule with generous buffer.',
      };
    case 'Mountain Road Delay Risk':
      return {
        label,
        bg: '#fbf6ea',
        text: '#8b5e34',
        detail: 'Mountain roads — weather-sensitive, slower in winter. Drive time may exceed standard.',
      };
    case 'Long Distance Drive':
      return {
        label,
        bg: '#fbf9f4',
        text: '#6b5933',
        detail: '5+ hour drive. Schedule rest stops; consider an overnight if pax sensitivity is high.',
      };
    case 'Heavy Traffic Risk':
      return {
        label,
        bg: '#eef3eb',
        text: '#5c6b50',
        detail: 'Airport route — peak-hour traffic can add 30-60 minutes. Plan around flight time.',
      };
    case 'Normal Traffic':
    default:
      return {
        label: 'Normal Traffic',
        bg: '#f5f8f5',
        text: '#3a5a3a',
        detail: 'Standard transfer — no known delay risk factors.',
      };
  }
}
