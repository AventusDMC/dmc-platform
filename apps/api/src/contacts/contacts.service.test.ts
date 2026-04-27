import test = require('node:test');
import assert = require('node:assert/strict');
const { ContactsService } = require('./contacts.service');

test('create contact for a different managed company succeeds', async () => {
  const service = new ContactsService({
    company: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, 'client-company-1');
        return { id: 'client-company-1', name: 'Client Company' };
      },
    },
    contact: {
      create: async ({ data }: any) => ({
        id: 'contact-1',
        ...data,
        company: { id: data.companyId, name: 'Client Company' },
      }),
    },
  } as any);

  const contact = await service.create(
    {
      companyId: 'client-company-1',
      firstName: ' Lina ',
      lastName: ' Haddad ',
      email: 'lina@example.com',
    },
    { companyId: 'dmc-company-1' } as any,
  );

  assert.equal(contact.companyId, 'client-company-1');
  assert.equal(contact.firstName, 'Lina');
  assert.equal(contact.lastName, 'Haddad');
});
