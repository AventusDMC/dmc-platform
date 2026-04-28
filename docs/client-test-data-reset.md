# Client Test Data Reset

This reset is for clearing transactional demo data before client testing.

It deletes quote, booking, invoice, operations, voucher, passenger, payment, and related audit rows only. It does not delete users, companies, contacts, hotels, suppliers, services, activities, transport, routes, rates, contracts, or other product catalog data.

## Safety

Take a database backup before running this against production.

The script refuses to run unless this flag is set:

```powershell
$env:CONFIRM_RESET_CLIENT_TEST_DATA = "true"
```

For extra protection, set a required substring that must appear in `DATABASE_URL`:

```powershell
$env:RESET_CLIENT_TEST_DATA_DATABASE_URL_MUST_INCLUDE = "railway"
```

Use a value that uniquely identifies the intended database host or database name.

## Run

From the repository root:

```powershell
$env:DATABASE_URL = "<intended database url>"
$env:CONFIRM_RESET_CLIENT_TEST_DATA = "true"
$env:RESET_CLIENT_TEST_DATA_DATABASE_URL_MUST_INCLUDE = "railway"
npm --workspace @dmc/api run reset:client-test-data
```

The script prints:

- target database identity
- redacted database URL
- counts before deletion
- counts after deletion

Review the target identity and counts before using the reset for client testing.

## Deleted Data

The reset removes:

- quotes, quote versions, quote items, quote options, quote pricing slabs, quote scenarios
- quote itinerary days/items and quote itinerary audit logs
- legacy quote itineraries and itinerary images
- public quote links/tokens, by deleting quote records
- bookings, booking days, booking services, booking passengers
- rooming entries and rooming assignments
- vouchers and supplier confirmations stored on booking services/vouchers
- invoices and invoice audit logs
- booking payments/payables stored in `payments`
- booking and invoice audit logs
- generic audit logs related to quote, booking, invoice, voucher, payment, or reminder activity

## Preserved Data

The reset preserves:

- users
- companies and clients
- contacts
- hotels and hotel catalog data
- suppliers
- services and service rates
- activities
- transport, routes, vehicles, vehicle rates
- contracts, contract imports, and hotel rates
- branding and settings
