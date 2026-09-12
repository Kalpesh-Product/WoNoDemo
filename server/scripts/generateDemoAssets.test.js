const test = require("node:test");
const assert = require("node:assert/strict");
const { generateAssets } = require("./generateDemoAssets");

test("generation is repeatable, varied, and uniquely identified", () => {
  const assets = generateAssets();
  assert.deepEqual(assets, generateAssets());
  assert.notDeepEqual(assets, generateAssets({ seed: 43 }));
  assert.equal(new Set(assets.map(a => a.assetId)).size, 20);
  assert.ok(new Set(assets.map(a => a.brand)).size > 1);
  assert.ok(assets.some(a => a.ownershipType === "Rental"));
  assert.ok(assets.some(a => a.isDamaged));
  assert.ok(assets.some(a => a.isUnderMaintenance));
  for (const asset of assets) {
    assert.ok(asset.price > 0);
    assert.ok(new Date(asset.warrantyExpiryDate) > new Date(asset.purchaseDate));
    assert.equal(asset.isAssigned, false);
    assert.ok(asset.Category && asset.location);
    assert.equal(asset.category, undefined);
    assert.equal(asset.unit, undefined);
  }
});

test("rejects invalid options and missing relationships", () => {
  for (const count of [0, -1, 1.5, NaN, 10001]) assert.throws(() => generateAssets({ count }));
  assert.throws(() => generateAssets({ seed: -1 }));
  assert.throws(() => generateAssets({ asOf: "2026-02-30" }));
  assert.throws(() => generateAssets({ references: {} }));
});

test("purchase dates stay in the generation year and expiry dates follow their terms", () => {
  for (const asOf of ['2026-01-01', '2026-09-09', '2027-01-01', '2028-12-31']) {
    for (const asset of generateAssets({ count: 100, asOf })) {
      const purchase = new Date(asset.purchaseDate);
      assert.equal(purchase.getUTCFullYear(), Number(asOf.slice(0, 4)));
      assert.ok(purchase <= new Date(`${asOf}T00:00:00.000Z`));
      const warrantyEnd = new Date(purchase);
      warrantyEnd.setUTCMonth(warrantyEnd.getUTCMonth() + asset.warranty);
      assert.equal(asset.warrantyExpiryDate, warrantyEnd.toISOString());
      if (asset.ownershipType === 'Rental') {
        const rentalEnd = new Date(purchase);
        rentalEnd.setUTCMonth(rentalEnd.getUTCMonth() + asset.rentedMonths);
        assert.equal(asset.rentedExpirationDate, rentalEnd.toISOString());
      }
    }
  }
});
