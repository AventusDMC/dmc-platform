'use client';

// formSafeOnly — the nuclear isolation level for the freeze hunt.
//
// Used when the operator hits `?cats=formSafeOnly`. The RoomCategoriesSection
// mounts THIS component instead of the full Manager tree. Goal: confirm
// whether the freeze persists even when:
//   - No router subscription (no useRouter / useSearchParams / usePathname)
//   - No internal state (no useState for fields)
//   - No effects (no useEffect, no useLayoutEffect)
//   - No memos (no useMemo / useCallback)
//   - No render counters or hard guards (zero diagnostic wrapping)
//   - No error boundary, no isolation ladder, no perf overlay
//
// If the operator visits ?cats=formSafeOnly and STILL freezes, the
// runaway is in something deeper — the Next.js app router, a context
// provider in template.tsx, or React itself attempting to hydrate the
// shell. That would be the strongest signal yet that the loop is in
// the platform layer, not our code.
//
// If this renders cleanly, the loop is in one of the layers we
// stripped (manager, error boundary, perf hooks, isolation ladder).

type Hotel = { id: string; name: string; city: string };

type BareRoomCategoryFormProps = {
  apiBaseUrl: string;
  hotels: Hotel[];
};

export function BareRoomCategoryForm({ apiBaseUrl, hotels }: BareRoomCategoryFormProps) {
  // Native form submit — no JS handler. The browser navigates to the
  // form action with the field values as query params; the server-side
  // page then processes via fetch. This means ZERO React reactivity in
  // the form lifecycle once mounted.
  return (
    <form
      action={`${apiBaseUrl}/hotels/__placeholder__/room-categories`}
      method="post"
      data-testid="bare-room-category-form"
      style={{
        background: '#fff',
        border: '1px solid #d0d5dd',
        borderRadius: 8,
        padding: '0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
        bare form mount — uncontrolled inputs, no router subscription, no React state, no effects.
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.78rem', gap: '0.2rem' }}>
        Hotel
        <select name="hotelId" defaultValue={hotels[0]?.id || ''}>
          {hotels.map((hotel) => (
            <option key={hotel.id} value={hotel.id}>
              {hotel.name}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.78rem', gap: '0.2rem' }}>
        Name
        <input name="name" placeholder="Standard" required />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.78rem', gap: '0.2rem' }}>
        Code
        <input name="code" placeholder="STD" />
      </label>
      <button
        type="button"
        disabled
        style={{ alignSelf: 'flex-start', padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
      >
        Submit disabled in formSafeOnly mode
      </button>
    </form>
  );
}
