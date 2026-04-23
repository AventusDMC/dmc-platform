type BookingRoomingSummaryCardProps = {
  roomCount: number;
  assignedPassengers: number;
  passengerCount: number;
  roomingIssues: string[];
};

export function BookingRoomingSummaryCard({
  roomCount,
  assignedPassengers,
  passengerCount,
  roomingIssues,
}: BookingRoomingSummaryCardProps) {
  return (
    <article className="booking-rooming-summary-card">
      <div>
        <p className="eyebrow">Rooming</p>
        <h3>Rooming summary</h3>
      </div>
      <div className="booking-rooming-summary-grid">
        <div>
          <span>Rooms</span>
          <strong>{roomCount}</strong>
        </div>
        <div>
          <span>Assigned pax</span>
          <strong>{assignedPassengers}</strong>
        </div>
        <div>
          <span>Manifest</span>
          <strong>{passengerCount}</strong>
        </div>
      </div>
      {roomingIssues.length > 0 ? (
        <div className="booking-rooming-summary-alerts">
          {roomingIssues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      ) : (
        <p className="detail-copy">No rooming issues are currently flagged.</p>
      )}
    </article>
  );
}
