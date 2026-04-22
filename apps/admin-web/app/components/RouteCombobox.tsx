'use client';

import { useEffect, useMemo, useState } from 'react';
import { RouteOption, formatRouteLabel } from '../lib/routes';

type RouteComboboxProps = {
  label: string;
  routes: RouteOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function RouteCombobox({ label, routes, value, onChange, placeholder }: RouteComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedRoute = useMemo(() => routes.find((route) => route.id === value) || null, [routes, value]);

  useEffect(() => {
    setQuery(selectedRoute ? formatRouteLabel(selectedRoute) : '');
  }, [selectedRoute]);

  const filteredRoutes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return routes
      .filter((route) => {
        if (!normalizedQuery) {
          return true;
        }

        return [
          route.name,
          route.routeType,
          route.fromPlace.name,
          route.toPlace.name,
          route.fromPlace.city,
          route.toPlace.city,
          route.notes,
        ]
          .filter(Boolean)
          .some((part) => part!.toLowerCase().includes(normalizedQuery));
      })
      .slice(0, 8);
  }, [query, routes]);

  return (
    <label className="search-combobox">
      {label}
      <div className="search-combobox-shell">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange('');
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
              setQuery(selectedRoute ? formatRouteLabel(selectedRoute) : '');
            }, 150);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            className="secondary-button search-combobox-clear"
            onClick={() => {
              onChange('');
              setQuery('');
              setIsOpen(false);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {isOpen ? (
        <div className="search-combobox-menu">
          {filteredRoutes.length === 0 ? (
            <p className="empty-state">No matching routes.</p>
          ) : (
            filteredRoutes.map((route) => (
              <button
                key={route.id}
                type="button"
                className={`search-combobox-option${value === route.id ? ' search-combobox-option-active' : ''}`}
                onClick={() => {
                  onChange(route.id);
                  setQuery(formatRouteLabel(route));
                  setIsOpen(false);
                }}
              >
                <strong>{route.name}</strong>
                <span>
                  {route.fromPlace.name} - {route.toPlace.name}
                  {route.routeType ? ` | ${route.routeType}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}
