import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { InlineEntityActions } from '../components/InlineEntityActions';
import { TableSectionShell } from '../components/TableSectionShell';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { RouteOption } from '../lib/routes';
import { TransportPricingRuleForm } from '../transport-pricing/TransportPricingRuleForm';
import { normalizeSupportedCurrency } from '../lib/currencyOptions';

const API_BASE_URL = ADMIN_API_BASE_URL;

type Vehicle = {
  id: string;
  name: string;
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type TransportPricingRule = {
  id: string;
  routeId: string;
  transportServiceTypeId: string;
  vehicleId: string;
  pricingMode: 'per_vehicle' | 'capacity_unit';
  minPax: number;
  maxPax: number;
  unitCapacity: number | null;
  baseCost: number;
  discountPercent: number;
  currency: string;
  isActive: boolean;
  route: {
    id: string;
    name: string;
  };
  transportServiceType: {
    id: string;
    name: string;
    code: string;
  };
  vehicle: {
    id: string;
    name: string;
  };
};

async function getVehicles(): Promise<Vehicle[]> {
  return adminPageFetchJson<Vehicle[]>(`${API_BASE_URL}/vehicles`, 'Transport pricing vehicles', {
    cache: 'no-store',
  });
}

async function getTransportServiceTypes(): Promise<TransportServiceType[]> {
  return adminPageFetchJson<TransportServiceType[]>(`${API_BASE_URL}/transport-service-types`, 'Transport pricing service types', {
    cache: 'no-store',
  });
}

async function getTransportPricingRules(): Promise<TransportPricingRule[]> {
  return adminPageFetchJson<TransportPricingRule[]>(`${API_BASE_URL}/transport-pricing/rules`, 'Transport pricing rules', {
    cache: 'no-store',
  });
}

async function getRoutes(): Promise<RouteOption[]> {
  return adminPageFetchJson<RouteOption[]>(`${API_BASE_URL}/routes`, 'Transport pricing routes', {
    cache: 'no-store',
  });
}

function formatPricingMode(value: TransportPricingRule['pricingMode']) {
  return value === 'capacity_unit' ? 'Capacity Unit' : 'Per Vehicle';
}

function getFinalCost(rule: Pick<TransportPricingRule, 'baseCost' | 'discountPercent'>) {
  return rule.baseCost * (1 - rule.discountPercent / 100);
}

export async function TransportPricingRulesSection() {
  const [vehicles, serviceTypes, routes, transportPricingRules] = await Promise.all([
    getVehicles(),
    getTransportServiceTypes(),
    getRoutes(),
    getTransportPricingRules(),
  ]);

  const routeEntries = Array.from(
    transportPricingRules.reduce((map, rule) => {
      const existing = map.get(rule.routeId);

      if (existing) {
        existing.rules.push(rule);
        return map;
      }

      map.set(rule.routeId, {
        route: rule.route,
        rules: [rule],
      });

      return map;
    }, new Map<string, { route: TransportPricingRule['route']; rules: TransportPricingRule[] }>()),
  ).sort((left, right) => left[1].route.name.localeCompare(right[1].route.name));

  return (
    <TableSectionShell
      title="Pricing Rules"
      description="Commercial setup grouped by route and service type using dedicated transport pricing rules."
      context={<p>{transportPricingRules.length} pricing rules in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create pricing rule" description="Add a rule without leaving the grouped pricing view." triggerLabelOpen="Add pricing rule">
          <TransportPricingRuleForm
            apiBaseUrl={API_BASE_URL}
            routes={routes}
            vehicles={vehicles}
            serviceTypes={serviceTypes}
            submitLabel="Add pricing rule"
            initialValues={{
              routeId: routes[0]?.id || '',
              transportServiceTypeId: serviceTypes[0]?.id || '',
              vehicleId: vehicles[0]?.id || '',
              pricingMode: 'per_vehicle',
              minPax: '1',
              maxPax: '1',
              unitCapacity: '',
              baseCost: '',
              discountPercent: '0',
              currency: 'USD',
              isActive: true,
            }}
          />
        </CollapsibleCreatePanel>
      }
      emptyState={
        routeEntries.length === 0 ? (
          <p className="empty-state">No transport pricing rules yet. Add the first rule to start structuring route-based transport pricing.</p>
        ) : undefined
      }
    >
      {routeEntries.length > 0 ? (
        <div className="entity-list">
          {routeEntries.map(([routeId, routeGroup]) => {
            const serviceTypeEntries = Array.from(
              routeGroup.rules.reduce((map, rule) => {
                const existing = map.get(rule.transportServiceTypeId);

                if (existing) {
                  existing.push(rule);
                  return map;
                }

                map.set(rule.transportServiceTypeId, [rule]);
                return map;
              }, new Map<string, TransportPricingRule[]>()),
            ).sort((left, right) => left[1][0].transportServiceType.name.localeCompare(right[1][0].transportServiceType.name));

            return (
              <article key={routeId} className="entity-card">
                <div className="entity-card-header">
                  <div>
                    <h2>{routeGroup.route.name}</h2>
                    <p>{routeGroup.rules.length} pricing rules</p>
                  </div>
                </div>

                <div className="entity-list">
                  {serviceTypeEntries.map(([serviceTypeId, rules]) => {
                    const sortedRules = [...rules].sort((left, right) => {
                      const vehicleComparison = left.vehicle.name.localeCompare(right.vehicle.name);
                      if (vehicleComparison !== 0) {
                        return vehicleComparison;
                      }

                      const modeComparison = left.pricingMode.localeCompare(right.pricingMode);
                      if (modeComparison !== 0) {
                        return modeComparison;
                      }

                      if (left.minPax !== right.minPax) {
                        return left.minPax - right.minPax;
                      }

                      return left.maxPax - right.maxPax;
                    });

                    return (
                      <article key={serviceTypeId} className="detail-card">
                        <div className="entity-card-header">
                          <div>
                            <h3>{rules[0].transportServiceType.name}</h3>
                            <p>{rules[0].transportServiceType.code}</p>
                          </div>
                          <CollapsibleCreatePanel title="Add rule" triggerLabelOpen="Add rule" triggerLabelClose="Hide form">
                            <div className="rates-editor-panel">
                              <TransportPricingRuleForm
                                apiBaseUrl={API_BASE_URL}
                                routes={routes}
                                vehicles={vehicles}
                                serviceTypes={serviceTypes}
                                submitLabel="Add pricing rule"
                                initialValues={{
                                  routeId,
                                  transportServiceTypeId: serviceTypeId,
                                  vehicleId: vehicles[0]?.id || '',
                                  pricingMode: 'per_vehicle',
                                  minPax: '1',
                                  maxPax: '1',
                                  unitCapacity: '',
                                  baseCost: '',
                                  discountPercent: '0',
                                  currency: 'USD',
                                  isActive: true,
                                }}
                              />
                            </div>
                          </CollapsibleCreatePanel>
                        </div>

                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Vehicle</th>
                              <th>Pricing Mode</th>
                              <th>Min Pax</th>
                              <th>Max Pax</th>
                              <th>Unit Capacity</th>
                              <th>Base Cost</th>
                              <th>Discount %</th>
                              <th>Final Cost</th>
                              <th>Currency</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedRules.map((rule) => (
                              <tr key={rule.id}>
                                <td>{rule.vehicle.name}</td>
                                <td>{formatPricingMode(rule.pricingMode)}</td>
                                <td>{rule.minPax}</td>
                                <td>{rule.maxPax}</td>
                                <td>{rule.unitCapacity ?? '-'}</td>
                                <td>{rule.baseCost.toFixed(2)}</td>
                                <td>{rule.discountPercent.toFixed(2)}</td>
                                <td>{getFinalCost(rule).toFixed(2)}</td>
                                <td>{rule.currency}</td>
                                <td>
                                  <InlineEntityActions
                                    apiBaseUrl={API_BASE_URL}
                                    deletePath={`/transport-pricing/rules/${rule.id}`}
                                    deleteLabel="transport pricing rule"
                                    confirmMessage={`Delete ${rule.route.name} / ${rule.transportServiceType.name}?`}
                                  >
                                    <TransportPricingRuleForm
                                      apiBaseUrl={API_BASE_URL}
                                      routes={routes}
                                      vehicles={vehicles}
                                      serviceTypes={serviceTypes}
                                      ruleId={rule.id}
                                      submitLabel="Save pricing rule"
                                      initialValues={{
                                        routeId: rule.routeId,
                                        transportServiceTypeId: rule.transportServiceTypeId,
                                        vehicleId: rule.vehicleId,
                                        pricingMode: rule.pricingMode,
                                        minPax: String(rule.minPax),
                                        maxPax: String(rule.maxPax),
                                        unitCapacity: rule.unitCapacity === null ? '' : String(rule.unitCapacity),
                                        baseCost: String(rule.baseCost),
                                        discountPercent: String(rule.discountPercent),
                                        currency: normalizeSupportedCurrency(rule.currency),
                                        isActive: rule.isActive,
                                      }}
                                    />
                                  </InlineEntityActions>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </article>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </TableSectionShell>
  );
}
