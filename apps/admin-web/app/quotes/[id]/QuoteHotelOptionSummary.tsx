type HotelFactSheet = {
  shortDescription?: string | null;
  highlightsJson?: unknown;
  amenitiesJson?: unknown;
};

type QuoteHotelOption = {
  id: string;
  city?: string | null;
  hotelNameSnapshot?: string | null;
  roomType?: string | null;
  mealPlan?: string | null;
  mealPlanCode?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | string | null;
  nights?: number | null;
  isPrimary?: boolean | null;
  roomCategory?: {
    name?: string | null;
    code?: string | null;
  } | null;
  hotel?: {
    name?: string | null;
    city?: string | null;
    factSheet?: HotelFactSheet | null;
  } | null;
};

export type ProposalReadyQuoteOption = {
  id: string;
  kind?: 'HOTEL_OPTION_SET' | 'COMMERCIAL_OPTION' | string | null;
  name: string;
  notes?: string | null;
  totalSell?: number | null;
  pricePerPax?: number | null;
  quoteItems?: unknown[];
  hotelOptions?: QuoteHotelOption[];
};

type QuoteHotelOptionSummaryProps = {
  options: ProposalReadyQuoteOption[];
  formatMoney: (amount: number) => string;
};

function listFactSheetValues(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  return String(value)
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getHotelOptionSetTone(name: string) {
  const normalized = name.trim().toUpperCase();

  if (/4\s*(?:STAR|\*)\s*STD|4\s*STD/.test(normalized)) {
    return 'quote-hotel-option-set-std';
  }

  if (/4\s*(?:STAR|\*)\s*DLX|4\s*DLX|DELUXE/.test(normalized)) {
    return 'quote-hotel-option-set-dlx';
  }

  return 'quote-hotel-option-set-custom';
}

function getHotelOptionSetLabel(name: string) {
  const normalized = name.trim().toUpperCase();

  if (/4\s*(?:STAR|\*)\s*STD|4\s*STD/.test(normalized)) {
    return '4\u2605 STD';
  }

  if (/4\s*(?:STAR|\*)\s*DLX|4\s*DLX|DELUXE/.test(normalized)) {
    return '4\u2605 DLX';
  }

  return 'Custom hotel set';
}

function renderFactSheet(factSheet?: HotelFactSheet | null) {
  if (!factSheet) {
    return null;
  }

  const highlights = listFactSheetValues(factSheet.highlightsJson);
  const amenities = listFactSheetValues(factSheet.amenitiesJson);

  if (!factSheet.shortDescription && highlights.length === 0 && amenities.length === 0) {
    return null;
  }

  return (
    <div className="quote-hotel-facts">
      {factSheet.shortDescription ? <p className="quote-hotel-description">{factSheet.shortDescription}</p> : null}
      {highlights.length > 0 ? (
        <div className="quote-hotel-fact-block">
          <span>Highlights</span>
          <ul>
            {highlights.slice(0, 4).map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {amenities.length > 0 ? (
        <div className="quote-hotel-fact-block">
          <span>Amenities</span>
          <ul className="quote-hotel-amenity-list">
            {amenities.slice(0, 6).map((amenity) => (
              <li key={amenity}>{amenity}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function getHotelName(hotelOption: QuoteHotelOption) {
  return hotelOption.hotel?.name || hotelOption.hotelNameSnapshot || 'Hotel or similar';
}

function getHotelCity(hotelOption: QuoteHotelOption) {
  return hotelOption.city || hotelOption.hotel?.city || 'City to be confirmed';
}

function getRoomLabel(hotelOption: QuoteHotelOption) {
  return hotelOption.roomCategory?.name || hotelOption.roomType || 'Room category to be confirmed';
}

function getMealPlanLabel(hotelOption: QuoteHotelOption) {
  return hotelOption.mealPlanCode || hotelOption.mealPlan || 'Meal plan to be confirmed';
}

function getNightsLabel(hotelOption: QuoteHotelOption) {
  const nights = Number(hotelOption.nights || 0);
  return nights > 0 ? `${nights} night${nights === 1 ? '' : 's'}` : 'Nights to be confirmed';
}

function HotelOptionSetSummary({ option }: { option: ProposalReadyQuoteOption }) {
  const hotelOptions = option.hotelOptions || [];
  const hotelsByCity = hotelOptions.reduce<Record<string, QuoteHotelOption[]>>((groups, hotelOption) => {
    const city = getHotelCity(hotelOption);
    groups[city] = [...(groups[city] || []), hotelOption];
    return groups;
  }, {});
  const setTone = getHotelOptionSetTone(option.name);
  const setLabel = getHotelOptionSetLabel(option.name);

  return (
    <section className={`quote-hotel-option-set ${setTone}`}>
      <header className="quote-hotel-option-set-head">
        <div>
          <span>{setLabel}</span>
          <strong>{option.name}</strong>
          {option.notes ? <p>{option.notes}</p> : null}
        </div>
        <p>{hotelOptions.length > 0 ? `${hotelOptions.length} accommodation option${hotelOptions.length === 1 ? '' : 's'}` : 'Accommodation options pending'}</p>
      </header>
      <div>
        {hotelOptions.length === 0 ? (
          <p className="empty-state">Accommodation options to be confirmed.</p>
        ) : (
          <div className="quote-hotel-city-list">
            {Object.entries(hotelsByCity).map(([city, cityOptions]) => (
              <section key={city} className="quote-hotel-city-group">
                <div className="quote-hotel-city-head">
                  <span>{city}</span>
                  <p>{cityOptions.length} option{cityOptions.length === 1 ? '' : 's'}</p>
                </div>
                <div className="quote-hotel-card-list">
                  {cityOptions.map((hotelOption) => (
                    <article key={hotelOption.id} className={`quote-hotel-card${hotelOption.isPrimary ? ' quote-hotel-card-primary' : ''}`}>
                      <div className="quote-hotel-card-head">
                        <div>
                          <strong>{getHotelName(hotelOption)}</strong>
                          <p>{getHotelCity(hotelOption)}</p>
                        </div>
                        <span className={hotelOption.isPrimary ? 'quote-hotel-badge quote-hotel-badge-primary' : 'quote-hotel-badge'}>
                          {hotelOption.isPrimary ? 'Recommended' : 'Alternative'}
                        </span>
                      </div>
                      <dl className="quote-hotel-meta-grid">
                        <div>
                          <dt>Room</dt>
                          <dd>{getRoomLabel(hotelOption)}</dd>
                        </div>
                        <div>
                          <dt>Meal</dt>
                          <dd>{getMealPlanLabel(hotelOption)}</dd>
                        </div>
                        <div>
                          <dt>Nights</dt>
                          <dd>{getNightsLabel(hotelOption)}</dd>
                        </div>
                      </dl>
                      {renderFactSheet(hotelOption.hotel?.factSheet)}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CommercialOptionSummary({ option, formatMoney }: { option: ProposalReadyQuoteOption; formatMoney: (amount: number) => string }) {
  return (
    <div className="quote-preview-option-row">
      <div>
        <strong>{option.name}</strong>
        <p>{option.notes || 'No notes provided.'}</p>
      </div>
      <div>
        <strong>{formatMoney(option.totalSell ?? 0)}</strong>
        <p>{formatMoney(option.pricePerPax ?? 0)} per pax</p>
      </div>
    </div>
  );
}

export function QuoteHotelOptionSummary({ options, formatMoney }: QuoteHotelOptionSummaryProps) {
  if (options.length === 0) {
    return <p className="empty-state">No accommodation options added yet.</p>;
  }

  return (
    <>
      {options.map((option) =>
        option.kind === 'HOTEL_OPTION_SET' ? (
          <HotelOptionSetSummary key={option.id} option={option} />
        ) : (
          <CommercialOptionSummary key={option.id} option={option} formatMoney={formatMoney} />
        ),
      )}
    </>
  );
}
