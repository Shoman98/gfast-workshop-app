/**
 * MOCK DATABASE - For local testing without Supabase
 * Stores data in memory during session
 * Perfect for UI/workflow testing before production DB setup
 */

import { v4 as uuidv4 } from 'uuid';

// In-memory storage
const db = {
  'workshop_app.workshops': new Map(),
  'workshop_app.estimates': new Map(),
  'workshop_app.estimate_parts': new Map(),
  'workshop_app.estimate_edits': new Map(),
  'workshop_app.estimate_audit_logs': new Map(),
};

// Initialize with test data
function initTestData() {
  const testWorkshopId = 'test-workshop-1';

  db['workshop_app.workshops'].set(testWorkshopId, {
    workshop_id: testWorkshopId,
    workshop_name: 'Test Workshop',
    pin_hash: '$2b$10$78DZ1DdVERbAZla9KX317enWnUDmsIP1hPmpumG5kVf3VnacLbSU.', // bcrypt of "1234"
    category: 'Auto Repair',
    phone: '01234567890',
    email: 'test@workshop.local',
    city: 'Cairo',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log('✅ Mock database initialized with test workshop');
  console.log('   Workshop ID: test-workshop-1');
  console.log('   PIN: 1234');
}

initTestData();

class QueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
    this._filter = null;
    this._orderBy = null;
    this._fields = '*';
  }

  select(fields = '*') {
    this._fields = fields;
    return this;
  }

  eq(column, value) {
    this._filter = { column, value };
    return this;
  }

  order(column, options = {}) {
    this._orderBy = { column, options };
    return this;
  }

  async single() {
    const table = db[this.tableName];
    if (!table) return { data: null, error: 'Table not found' };

    let result = null;

    if (this._filter) {
      for (const [, record] of table) {
        if (record[this._filter.column] === this._filter.value) {
          result = record;
          break;
        }
      }
    }

    return { data: result, error: result ? null : 'Not found' };
  }

  async insert(data) {
    const table = db[this.tableName];
    if (!table) return { data: null, error: 'Table not found' };

    const idField = this.tableName.replace('workshop_app.', '').replace(/s$/, '_id');
    const record = {
      ...data,
      [idField]: data[idField] || uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const id = record[idField];
    table.set(id, record);

    return { data: record, error: null };
  }

  async update(data) {
    const table = db[this.tableName];
    if (!table) return { data: null, error: 'Table not found' };

    let updated = null;

    for (const [key, record] of table) {
      if (this._filter && record[this._filter.column] === this._filter.value) {
        const merged = { ...record, ...data, updated_at: new Date().toISOString() };
        table.set(key, merged);
        updated = merged;
        break;
      }
    }

    return { data: updated, error: updated ? null : 'Not found' };
  }

  async delete() {
    const table = db[this.tableName];
    if (!table) return { error: 'Table not found' };

    for (const [key, record] of table) {
      if (this._filter && record[this._filter.column] === this._filter.value) {
        table.delete(key);
        return { error: null };
      }
    }

    return { error: 'Not found' };
  }

  async execute() {
    const table = db[this.tableName];
    if (!table) return { data: [], error: 'Table not found' };

    let results = Array.from(table.values());

    if (this._filter) {
      results = results.filter((r) => r[this._filter.column] === this._filter.value);
    }

    if (this._orderBy) {
      const { column, options } = this._orderBy;
      results.sort((a, b) => {
        if (options.ascending) {
          return a[column] > b[column] ? 1 : -1;
        }
        return a[column] < b[column] ? 1 : -1;
      });
    }

    return { data: results, error: null };
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }
}

// Mock Supabase client
export const supabase = {
  from(tableName) {
    return new QueryBuilder(tableName);
  },
};

export default { supabase };
