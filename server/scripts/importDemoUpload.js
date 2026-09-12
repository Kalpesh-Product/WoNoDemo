const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const mongoose = require("mongoose");
const { EJSON } = require("bson");
const { models } = require("./buildDemoUpload");

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: "demo-upload" },
      db: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const uri = process.env.DB_URL;
  if (!uri || !values.db)
    throw new Error(
      "Set DB_URL and supply --db with the target database name.",
    );
  const host = new URL(uri).hostname;
  if (host.toLowerCase() !== "cluster0.d9cnr.mongodb.net")
    throw new Error(
      "This importer only accepts the target cluster cluster0.d9cnr.mongodb.net.",
    );
  const data = Object.fromEntries(
    Object.keys(models).map((key) => [
      key,
      EJSON.parse(
        fs.readFileSync(path.join(values.dir, key + ".json"), "utf8"),
      ),
    ]),
  );
  const updates = EJSON.parse(
    fs.readFileSync(path.join(values.dir, "departmentUpdates.json"), "utf8"),
  );
  for (const [key, Model] of Object.entries(models))
    for (const record of data[key]) {
      const error = new Model(record).validateSync();
      if (error) throw error;
    }
  const same = (a, b) => String(a) === String(b);
  const find = (key, id) => data[key].find((r) => same(r._id, id));
  for (const user of data.userdatas) {
    if (!user.role.length || user.role.some(id => !find('roles', id))) throw new Error('Missing demo user role');
    for (const assetId of user.assignedAsset) {
      const assignment = data.assignassets.find(a => same(a.asset, assetId) && same(a.assignee, user._id));
      if (!assignment) throw new Error('Invalid user asset backlink');
    }
  }
  for (const item of data.items)
    if (!find("categories", item.category))
      throw new Error("Missing item category");
  for (const sub of data.subcategories)
    if (!find("categories", sub.category))
      throw new Error("Missing subcategory parent");
  for (const asset of data.assets) {
    const sub = find("subcategories", asset.subCategory);
    if (!sub || !same(sub.category, asset.Category))
      throw new Error("Invalid asset category links");
    if (asset.isAssigned && !find("assignassets", asset.assignedAsset))
      throw new Error("Missing asset assignment");
  }
  for (const assignment of data.assignassets) {
    const asset = find("assets", assignment.asset);
    if (
      !asset ||
      !asset.isAssigned ||
      !same(asset.assignedAsset, assignment._id)
    )
      throw new Error("Invalid assignment backlink");
    const assignee = find('userdatas', assignment.assignee);
    if (!assignee || !same(assignee.company, assignment.company) || !assignee.departments.some(d => same(d, assignment.toDepartment)) || !assignee.assignedAsset.some(id => same(id, asset._id))) throw new Error('Invalid assignee relationship');
  }
  for (const stock of data.inventories)
    if (!find("items", stock.itemName))
      throw new Error("Missing inventory item");
  await mongoose.connect(uri, {
    dbName: values.db,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  async function checkReferences(session) {
    const options = session ? { session } : {};
    for (const asset of data.assets) {
      if (
        !(await db
          .collection("companies")
          .findOne({ _id: asset.company }, options))
      )
        throw new Error("Company not found in target");
      if (
        !(await db
          .collection("departments")
          .findOne({ _id: asset.department }, options))
      )
        throw new Error("Department not found in target");
      if (
        !(await db
          .collection("units")
          .findOne({ _id: asset.location, company: asset.company }, options))
      )
        throw new Error("Unit missing or belongs to another company");
    }
    const users = new Map();
    for (const assignment of data.assignassets)
      for (const field of ["assignee", "assignedBy", "approvedBy"])
        users.set(String(assignment[field]), {
          _id: assignment[field],
          company: assignment.company,
        });
    for (const item of data.items) {
      const category = find("categories", item.category);
      users.set(String(item.addedBy), {
        _id: item.addedBy,
        company: category.company,
      });
    }
    for (const stock of data.inventories) users.set(String(stock.addedBy), { _id: stock.addedBy, company: stock.company });
    for (const query of users.values()) {
      const generated = find('userdatas', query._id);
      if (generated && same(generated.company, query.company)) continue;
      if (!(await db.collection("userdatas").findOne(query, options)))
        throw new Error(
          "Referenced user missing or belongs to another company: " +
            query._id,
        );
    }
    for (const user of data.userdatas) {
      const existing = await db.collection('userdatas').findOne({ $or: [{ _id: user._id }, { email: user.email }, { empId: user.empId }] }, options);
      if (existing && (!same(existing._id, user._id) || !same(existing.company, user.company) || existing.email !== user.email || existing.empId !== user.empId || !user.role.every(r => existing.role?.some(e => same(e, r))))) throw new Error('Demo user conflicts with an existing user: ' + user.empId);
    }
    for (const update of updates) {
      if (
        update.updateOne.upsert !== false ||
        !data.categories.some((c) =>
          same(c.department, update.updateOne.filter._id),
        )
      )
        throw new Error("Invalid department update");
      for (const id of update.updateOne.update.$addToSet.assetCategories.$each)
        if (
          !data.categories.some(
            (c) =>
              same(c._id, id) &&
              same(c.department, update.updateOne.filter._id),
          )
        )
          throw new Error("Invalid department category link");
    }
  }
  await checkReferences();
  console.table(
    Object.keys(models).map((key) => ({
      collection: models[key].collection.name,
      records: data[key].length,
    })),
  );
  if (!values.apply) {
    console.log("Preflight passed. No writes. Add --apply to import.");
    return;
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await checkReferences(session);
      for (const [key, Model] of Object.entries(models)) {
        const collection = db.collection(Model.collection.name);
        // Existing IDs are never overwritten: reruns only add missing documents.
        if (data[key].length)
          await collection.bulkWrite(
            data[key].map((record) => ({
              updateOne: {
                filter: { _id: record._id },
                update: { $setOnInsert: record },
                upsert: true,
              },
            })),
            { session },
          );
      }
      // Earlier generated assets may already exist. Refuse inconsistent assignment state.
      for (const assignment of data.assignassets) {
        const asset = await db
          .collection("assets")
          .findOne({ _id: assignment.asset }, { session });
        if (!asset.isAssigned || !same(asset.assignedAsset, assignment._id))
          throw new Error(
            "Existing asset differs from this bundle. Import into a clean demo dataset; no existing assets were overwritten.",
          );
      }
      await db.collection("departments").bulkWrite(updates, { session });
    });
    console.log(
      "Import committed. Existing documents were preserved; category links added to existing departments.",
    );
  } finally {
    await session.endSession();
  }
}
if (require.main === module)
  main()
    .catch((error) => {
      console.error(
        String(error.message).replace(
          /mongodb(?:\+srv)?:\/\/\S+/g,
          "[redacted URI]",
        ),
      );
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
