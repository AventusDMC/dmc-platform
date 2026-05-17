const rolesGuardTest = require('node:test');
const rolesGuardAssert = require('node:assert/strict');
const { RolesGuard } = require('./roles.guard');

function createContext(actor: any) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ authenticatedActor: actor }),
    }),
  };
}

function createGuard(requiredRoles: string[]) {
  return new RolesGuard({
    getAllAndOverride: (key: string) => {
      if (key === 'roles') {
        return requiredRoles;
      }

      return false;
    },
  } as any);
}

rolesGuardTest.test('legacy admin and super admin roles can access admin guarded agent management APIs', () => {
  const guard = createGuard(['admin']);

  rolesGuardAssert.equal(guard.canActivate(createContext({ role: 'admin' })), true);
  rolesGuardAssert.equal(guard.canActivate(createContext({ role: 'super_admin' })), true);
  rolesGuardAssert.equal(guard.canActivate(createContext({ role: 'agent_admin' })), true);
});

rolesGuardTest.test('non-admin roles get a permission message instead of role lookup text', () => {
  const guard = createGuard(['admin']);

  rolesGuardAssert.throws(
    () => guard.canActivate(createContext({ role: 'viewer' })),
    /You do not have permission to access this admin area/,
  );
});
