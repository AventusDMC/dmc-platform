# Hotel Contract Excel Import Template

Official template: `docs/templates/hotel-contract-import-template.xlsx`

This format matches `ContractImportsService.extractHotelExcelTemplatePreview`.

## Sheets

Required:
- `Rates`

Optional:
- `Meta`
- `RoomCategories`
- `Supplements`
- `Policies`
- `CancellationPolicy`
- `RatePolicies`

Unknown sheets are ignored by the parser.

## Sheet Columns

### Meta

Rows may be key/value rows.

Recognized columns:
- `Key`, `Value`
- aliases: `Field`, `Name`, `Data`

Recognized keys:
- `Hotel Name`
- `Hotel`
- `Supplier Name`
- `Supplier`
- `Contract Name`
- `Contract`
- `Valid From`
- `Contract Start Date`
- `Start Date`
- `Valid To`
- `Contract End Date`
- `End Date`
- `Currency`
- `Default Tax Percent`
- `Default Tax`
- `Tax Percent`
- `Tax Included`
- `Default Service Percent`
- `Default Service`
- `Default Service Charge`
- `Service Percent`
- `Service Included`
- `Service Charge Included`
- `City`
- `Category`
- `Hotel Category`

### Rates

Required headers:
- `Room Type`
- `Occupancy`
- `Meal Plan`
- `Cost`

Optional headers:
- `Season From`
- `Season To`
- `Currency`
- `Pricing Basis`
- `Tax %`
- `Tax Percent`
- `Tax Included`
- `Service %`
- `Service Percent`
- `Service Included`

Example:

| Room Type | Occupancy | Meal Plan | Season From | Season To | Cost | Currency | Pricing Basis | Tax % | Tax Included | Service % | Service Included |
| --- | --- | --- | --- | --- | ---: | --- | --- | ---: | --- | ---: | --- |
| Deluxe Room | DBL | BB | 2026-01-01 | 2026-12-31 | 120 | JOD | PER_ROOM | 8 | No | 5 | No |

### RoomCategories

Optional headers:
- `Name`
- `Room Type`
- `Room Category`
- `Code`
- `Description`
- `Notes`

At least one of `Name`, `Room Type`, or `Room Category` must be present for the row to be used.

### Supplements

Optional headers:
- `Name`
- `Supplement`
- `Type`
- `Charge Basis`
- `Basis`
- `Amount`
- `Cost`
- `Currency`
- `Pricing Basis`
- `Mandatory`
- `Notes`

### Policies

Optional headers:
- `Name`
- `Policy`
- `Value`
- `Description`
- `Notes`

### CancellationPolicy

Optional headers:
- `Summary`
- `Notes`
- `No Show Penalty Type`
- `No Show Penalty Value`
- `Days Before`
- `DaysBefore`
- `Window From`
- `WindowFromValue`
- `Window To`
- `WindowToValue`
- `Deadline Unit`
- `Penalty Type`
- `Penalty Percent`
- `Penalty %`
- `PenaltyPercent`
- `Penalty Value`

Rows with neither days/window nor penalty value are ignored.

### RatePolicies

Optional headers:
- `Policy Type`
- `Applies To`
- `Age From`
- `Age To`
- `Amount`
- `Percent`
- `Currency`
- `Pricing Basis`
- `Meal Plan`
- `Notes`

Rows without `Policy Type` are ignored.

## Accepted Values

Meal plan:
- `RO`
- `BB`
- `HB`
- `FB`
- `AI`

Occupancy:
- `SGL`, `SINGLE`
- `DBL`, `DOUBLE`, `TWIN`
- `TPL`, `TRP`

Room category/type:
- Free-text. The parser matches by name and creates room categories as needed.

Supplement type:
- `EXTRA_BED`
- `EXTRA_BREAKFAST`
- `EXTRA_LUNCH`
- `EXTRA_DINNER`
- `GALA_DINNER`
- `MANDATORY_SUPPLEMENT`
- `OPTIONAL_SUPPLEMENT`

Supplement charge basis:
- `PER_PERSON`
- `PER_ROOM`
- `PER_STAY`
- `PER_NIGHT`

Pricing basis:
- `PER_PERSON`
- `PER_ROOM`
- aliases accepted: `per person`, `pp`, `per pax`, `person`, `pax`, `per room`, `per unit`, `room`, `unit`

Tax/service included:
- true values: `true`, `yes`, `y`, `1`, `included`, `inclusive`
- false values: `false`, `no`, `n`, `0`, `excluded`, `exclusive`

Currency:
- `USD`
- `EUR`
- `JOD`

Cancellation penalty type:
- `PERCENT`
- `NIGHTS`
- `FULL_STAY`
- `FIXED`

Cancellation deadline unit:
- `DAYS`
- `HOURS`

Rate policy type:
- `CHILD_FREE`
- `CHILD_DISCOUNT`
- `CHILD_EXTRA_BED`
- `ADULT_EXTRA_BED`
- `CHILD_EXTRA_MEAL`
- `ADULT_EXTRA_MEAL`
- `SINGLE_SUPPLEMENT`
- `THIRD_PERSON_SUPPLEMENT`
- `SPECIAL_EVENT_SUPPLEMENT`

## Dates and Numbers

Dates:
- Prefer ISO date strings: `YYYY-MM-DD`.
- Parser also accepts JavaScript-parseable dates and numeric `DD/MM/YYYY`, `DD-MM-YYYY`, or `DD.MM.YYYY`.
- If year is omitted in numeric dates, the current year is used.

Numbers:
- Numeric fields may include commas, currency symbols, and percent signs; non-numeric characters are stripped.
- Blank numeric cells parse as empty.
- `Rates.Cost` must be present and greater than zero for the row to be imported.

## Validation Rules

Workbook-level:
- The `Rates` sheet must exist.
- The `Rates` sheet must include `Room Type`, `Occupancy`, `Meal Plan`, and `Cost`.

Approval-level:
- Supplier name is required.
- Hotel name is required for hotel imports.
- Contract `validFrom` and `validTo` are required and must be valid dates.
- Contract `validTo` cannot be before `validFrom`.
- Contract, rate, and supplement currencies must be one of `USD`, `EUR`, `JOD`.
- Rate cost is required.
- Rate season dates must be valid if supplied.
- Meal plan must be one of the accepted meal plan codes.
- Supplement amount is required when a supplement row exists.
- Supplement type and charge basis must be recognized if supplied.
- Rate policy numeric fields must be numeric.
- Rate policy ages must be zero or greater, and `Age To` cannot be lower than `Age From`.
- Rate policy percent must be between 0 and 100.
