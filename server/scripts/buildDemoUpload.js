const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const { EJSON } = require('bson');
const mongoose = require('mongoose');
const { generateBundle } = require('./generateDepartmentAssets');
const { cleanRecord } = require('./removeDemoLabels');
const models = {
  roles: require('../models/roles/Roles'),
  userdatas: require('../models/hr/UserData'),
  categories: require('../models/category/Category'),
  subcategories: require('../models/category/SubCategories'),
  items: require('../models/Item'),
  assets: require('../models/assets/Assets'),
  assignassets: require('../models/assets/AssignAsset'),
  inventories: require('../models/inventory/Inventory'),
};
const id = key => createHash('sha256').update('demo-upload-v1:' + key).digest('hex').slice(0, 24);
function build(inputs) {
  const bundle = generateBundle(inputs);
  const date = new Date(inputs.asOf + 'T00:00:00.000Z');
  bundle.items = []; bundle.assignassets = []; bundle.inventories = [];
  bundle.roles = []; bundle.userdatas = [];
  for (const department of bundle.summary) {
    const assets = bundle.assets.filter(a => a.description === `Synthetic ${department.department} asset. Price is USD.`);
    const first = assets[0];
    const role = { _id: id(first.department + ':demo-role'), roleTitle: `Demo ${department.department} Specialist`, roleID: `DEMO-ROLE-${first.department}` };
    bundle.roles.push(role);
    const names = [['Aisha', 'Shah'], ['Daniel', 'Wilson'], ['Priya', 'Mehta'], ['Marcus', 'Reed'], ['Sofia', 'Chen'], ['Omar', 'Patel'], ['Maya', 'Brooks'], ['Noah', 'Singh']];
    const users = Array.from({ length: 3 }, (_, index) => {
      const userId = id(first.company + ':' + first.department + ':user:' + index);
      const [firstName, lastName] = names[(bundle.summary.indexOf(department) * 3 + index) % names.length];
      return { _id: userId, empId: `DEMO-${userId}`, firstName, lastName, gender: 'Other', dateOfBirth: new Date(`${1988 + index * 4}-03-15T00:00:00.000Z`), phone: `+1202555${String(100 + bundle.summary.indexOf(department) * 3 + index).padStart(4, '0')}`, email: `demo.${userId}@example.com`, company: first.company, departments: [first.department], role: [role._id], assignedAsset: [], designation: role.roleTitle, jobDescription: 'Synthetic demo employee record', startDate: `${inputs.asOf.slice(0, 4)}-01-01T00:00:00.000Z`, workLocation: inputs.units.find(u => u._id.$oid === first.location)?.unitNo, isActive: true };
    });
    bundle.userdatas.push(...users);
    const admin = users[0]._id;
    const category = { _id: id(first.department + ':supplies'), categoryName: `Demo ${department.department} Supplies`, company: first.company, department: first.department, appliesTo: ['inventory'], isActive: true };
    bundle.categories.push(category);
    bundle.departmentUpdates.find(u => u.updateOne.filter._id === first.department).updateOne.update.$addToSet.assetCategories.$each.push(category._id);
    for (const [i, name] of ['Notebooks', 'Pens', 'Printer Paper'].entries()) {
      const item = { _id: id(first.department + ':' + name), name: `Demo ${name}`, department: first.department, category: category._id, addedBy: admin, isActive: true };
      bundle.items.push(item);
      const price = [4, 1.5, 7][i];
      bundle.inventories.push({ _id: id(item._id + ':stock'), company: first.company, department: first.department, itemName: item._id, unit: first.location, addedBy: admin, openingInventoryUnits: 0, openingPerUnitPrice: 0, openingInventoryValue: 0, newPurchaseUnits: 100, newPurchasePerUnitPrice: price, newPurchaseInventoryValue: 100 * price, remainingUnits: 100, assignedUnits: 0, consumptions: [] });
    }
    for (const asset of assets.slice(0, 5)) {
      const assignee = users[assets.indexOf(asset) % users.length];
      const assignment = { _id: id(asset._id + ':assignment'), asset: asset._id, company: asset.company, fromDepartment: asset.department, toDepartment: asset.department, location: asset.location, assignee: assignee._id, assignedBy: admin, approvedBy: admin, status: 'Approved', isRevoked: false };
      assignee.assignedAsset.push(asset._id);
      bundle.assignassets.push(assignment);
      asset.isAssigned = true; asset.assignedAsset = assignment._id;
    }
  }
  for (const [key, Model] of Object.entries(models)) {
    bundle[key] = bundle[key].map(record => {
      const doc = new Model(cleanRecord({ ...record, createdAt: date, updatedAt: date }));
      const error = doc.validateSync(); if (error) throw error;
      return doc.toObject({ versionKey: false });
    });
  }
  bundle.departmentUpdates = bundle.departmentUpdates.map(op => ({ updateOne: { filter: { _id: new mongoose.Types.ObjectId(op.updateOne.filter._id) }, update: { $addToSet: { assetCategories: { $each: op.updateOne.update.$addToSet.assetCategories.$each.map(v => new mongoose.Types.ObjectId(v)) } } }, upsert: false } }));
  return bundle;
}
if (require.main === module) {
  try {
    const { values } = parseArgs({ options: { source: { type: 'string' }, out: { type: 'string', default: 'demo-upload' }, 'as-of': { type: 'string', default: new Date().toISOString().slice(0, 10) } } });
    if (!values.source) throw new Error('--source is required');
    const inputs = Object.fromEntries(['companies', 'departments', 'units'].map(k => [k, JSON.parse(fs.readFileSync(path.join(values.source, `WonoUserData.${k}.json`), 'utf8').replace(/^\uFEFF/, ''))]));
    const bundle = build({ ...inputs, asOf: values['as-of'] });
    fs.mkdirSync(values.out);
    for (const key of [...Object.keys(models), 'departmentUpdates']) fs.writeFileSync(path.join(values.out, key + '.json'), EJSON.stringify(bundle[key], null, 2));
    console.table(Object.keys(models).map(k => ({ collection: models[k].collection.name, records: bundle[k].length })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { build, models };
