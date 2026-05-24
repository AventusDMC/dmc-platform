// Single source of truth for the operating-team's display timezone. Used for
// any date/time the operations team needs to read (booking timeline, operations
// grid, voucher detail, etc.). Pinning a timezone explicitly also stabilises
// server/client rendering — without it, the server formats in UTC and the
// browser in local time, producing hydration mismatches.
//
// Change this single constant if the operating team moves to a different
// timezone. Suppliers / clients in other timezones still see their own dates
// on documents addressed to them — that's a separate concern.
export const OPERATIONS_TIME_ZONE = 'Asia/Amman';
