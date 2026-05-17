const usersTest = require('node:test');
const usersAssert = require('node:assert/strict');
const { UsersService } = require('./users.service');

function createUsersService() {
  const calls: any = {
    userCreate: [],
    agentFindMany: [],
    roleCreate: [],
  };
  const service = new UsersService(
    {
      role: {
        findFirst: async ({ where }: any) => {
          const name = typeof where.name === 'string' ? where.name : where.name?.equals;
          return name === 'missing_agent_admin' ? null : { id: `role-${name}`, name };
        },
        create: async ({ data }: any) => {
          calls.roleCreate.push(data);
          return { id: `role-${data.name}`, name: data.name };
        },
      },
      user: {
        findMany: async (args: any) => {
          calls.agentFindMany.push(args);
          return [
            {
              id: 'agent-1',
              firstName: 'Demo',
              lastName: 'Agent',
              email: 'agent@example.com',
              companyId: 'company-agent',
              active: true,
              company: { id: 'company-agent', name: 'Demo Agent Company' },
              role: { name: 'agent' },
            },
          ];
        },
        create: async (args: any) => {
          calls.userCreate.push(args);
          return {
            id: 'agent-2',
            firstName: args.data.firstName,
            lastName: args.data.lastName,
            email: args.data.email,
            companyId: args.data.companyId,
            active: args.data.active,
            company: { id: args.data.companyId, name: 'Demo Agent Company' },
            role: { name: 'agent' },
          };
        },
      },
    } as any,
    {
      hashPassword: (value: string) => `hashed:${value}`,
    } as any,
    {
      log: async () => undefined,
    } as any,
  );

  return { service, calls };
}

usersTest.test('findAgents exposes active agent users with company linkage for quote dropdowns and portal scope', async () => {
  const { service, calls } = createUsersService();

  const agents = await service.findAgents({ companyId: 'operator-company' } as any);

  usersAssert.deepEqual(calls.agentFindMany[0].where, { role: { name: 'agent' } });
  usersAssert.equal(agents[0].id, 'agent-1');
  usersAssert.equal(agents[0].companyId, 'company-agent');
  usersAssert.equal(agents[0].companyName, 'Demo Agent Company');
  usersAssert.equal(agents[0].status, 'active');
});

usersTest.test('create supports agent company linkage, temporary password, and active status', async () => {
  const { service, calls } = createUsersService();

  const agent = await service.create(
    {
      name: 'Portal Agent',
      email: ' Portal.Agent@Example.com ',
      role: 'agent',
      companyId: 'company-agent',
      password: 'reset123',
      active: false,
    },
    { companyId: 'operator-company' } as any,
  );

  usersAssert.equal(calls.userCreate[0].data.companyId, 'company-agent');
  usersAssert.equal(calls.userCreate[0].data.email, 'portal.agent@example.com');
  usersAssert.equal(calls.userCreate[0].data.password, 'hashed:reset123');
  usersAssert.equal(calls.userCreate[0].data.active, false);
  usersAssert.equal(agent.companyId, 'company-agent');
  usersAssert.equal(agent.status, 'inactive');
});

usersTest.test('create auto-seeds configured admin roles when role seed is missing', async () => {
  const { service, calls } = createUsersService();
  const originalNormalizeRole = (service as any).normalizeRole.bind(service);
  (service as any).normalizeRole = (role: string) => role === 'missing_agent_admin' ? 'agent_admin' : originalNormalizeRole(role);
  (service as any).findOrCreateRole = async (role: string) => {
    if (role !== 'agent_admin') {
      return null;
    }

    calls.roleCreate.push({ name: role });
    return { id: 'role-agent-admin', name: role };
  };

  await service.create(
    {
      name: 'Agent Admin',
      email: 'agent.admin@example.com',
      role: 'missing_agent_admin' as any,
    },
    { companyId: 'operator-company' } as any,
  );

  usersAssert.equal(calls.roleCreate[0].name, 'agent_admin');
  usersAssert.equal(calls.userCreate[0].data.roleId, 'role-agent-admin');
});
