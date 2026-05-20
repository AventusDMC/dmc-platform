import { expect, test } from '@playwright/test';

test('transport tariff export supplier selection updates download URL immediately', async ({ page }) => {
  await page.route('**/api/vehicle-rates/tariff-matrix/transfer/export?supplierId=supplier-almushtari', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="almushtari-transfer-route-tariff-matrix.txt"',
      },
      body: 'Supplier\nAlmushtari Logistics Services\n',
    });
  });

  await page.setContent(`
    <base href="http://localhost:3000/" />
    <label>
      Supplier
      <select name="supplierId" aria-label="Supplier">
        <option value="">All suppliers</option>
        <option value="supplier-almushtari">Almushtari Logistics Services</option>
        <option value="supplier-alpha">Alpha Transportation</option>
      </select>
    </label>
    <a class="primary-button" href="/api/vehicle-rates/tariff-matrix/transfer/export" download>
      Export Transfer Tariffs
    </a>
    <script>
      const supplier = document.querySelector('select[name="supplierId"]');
      const transfer = document.querySelector('a.primary-button');
      function updateExportHref() {
        const params = new URLSearchParams();
        if (supplier.value) params.set('supplierId', supplier.value);
        transfer.href = '/api/vehicle-rates/tariff-matrix/transfer/export' + (params.toString() ? '?' + params.toString() : '');
      }
      supplier.addEventListener('change', updateExportHref);
    </script>
  `);

  await page.getByLabel('Supplier').selectOption('supplier-almushtari');
  const transferExport = page.getByRole('link', { name: 'Export Transfer Tariffs' });

  await expect(transferExport).toHaveAttribute('href', /supplierId=supplier-almushtari/);

  const [download] = await Promise.all([page.waitForEvent('download'), transferExport.click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  const body = Buffer.concat(chunks).toString('utf8');
  expect(body).toContain('Almushtari Logistics Services');
  expect(body).not.toContain('Alpha Transportation');
});
