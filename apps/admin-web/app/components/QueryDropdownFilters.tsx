'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdvancedFiltersPanel } from './AdvancedFiltersPanel';
import { CompactFilterBar } from './CompactFilterBar';

export type QueryDropdownFilterOption = {
  value: string;
  label: string;
};

export type QueryDropdownFilterDefinition = {
  key: string;
  label: string;
  placeholder: string;
  value?: string;
  options: QueryDropdownFilterOption[];
  resetKeys?: string[];
  advanced?: boolean;
  disabled?: boolean;
};

type QueryDropdownFiltersProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  filters: QueryDropdownFilterDefinition[];
  advancedTitle?: string;
  advancedDescription?: string;
};

function getFilterLabel(filter: QueryDropdownFilterDefinition) {
  if (!filter.value) {
    return '';
  }

  return filter.options.find((option) => option.value === filter.value)?.label || filter.value;
}

export function QueryDropdownFilters({
  eyebrow,
  title,
  description,
  filters,
  advancedTitle = 'Advanced filters',
  advancedDescription = 'Additional list filters',
}: QueryDropdownFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickFilters = filters.filter((filter) => !filter.advanced);
  const advancedFilters = filters.filter((filter) => filter.advanced);
  const activeFilters = filters.filter((filter) => filter.value);
  const filterKeys = filters.map((filter) => filter.key);

  function updateParams(nextFilter: QueryDropdownFilterDefinition, nextValue: string) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextValue) {
      nextParams.set(nextFilter.key, nextValue);
    } else {
      nextParams.delete(nextFilter.key);
    }

    for (const key of nextFilter.resetKeys || []) {
      nextParams.delete(key);
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  function clearFilter(filter: QueryDropdownFilterDefinition) {
    updateParams(filter, '');
  }

  function clearAllFilters() {
    const nextParams = new URLSearchParams(searchParams.toString());

    for (const key of filterKeys) {
      nextParams.delete(key);
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  function renderFilterControls(definitions: QueryDropdownFilterDefinition[]) {
    if (definitions.length === 0) {
      return null;
    }

    return (
      <div className="operations-filter-grid compact-query-filter-grid">
        {definitions.map((filter) => (
          <label key={filter.key}>
            <span>{filter.label}</span>
            <select
              value={filter.value || ''}
              disabled={filter.disabled}
              onChange={(event) => updateParams(filter, event.target.value)}
            >
              <option value="">{filter.placeholder}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }

  return (
    <CompactFilterBar eyebrow={eyebrow} title={title} description={description}>
      {quickFilters.length > 0 ? renderFilterControls(quickFilters) : null}

      <div className="operations-quick-links">
        {activeFilters.length > 0 ? (
          <>
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className="compact-filter-chip"
                onClick={() => clearFilter(filter)}
              >
                {filter.label}: {getFilterLabel(filter)}
              </button>
            ))}
            <button type="button" className="secondary-button" onClick={clearAllFilters}>
              Clear filters
            </button>
          </>
        ) : (
          <span className="detail-copy">No filters applied.</span>
        )}
      </div>

      {advancedFilters.length > 0 ? (
        <AdvancedFiltersPanel title={advancedTitle} description={advancedDescription}>
          {renderFilterControls(advancedFilters)}
        </AdvancedFiltersPanel>
      ) : null}
    </CompactFilterBar>
  );
}
