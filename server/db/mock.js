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
    this._filters = []; // Support multiple filters
    this._orderBy = null;
    this._fields = '*';
    this._insertData = null;
    this._updateData = null;
    this._isInsertChain = false;
  }

  select(fields = '*') {
    if (this._mode === 'insert') {
      // Called from insert().select() - execute insert and store results
      const table = db[this.tableName];
      if (!table) {
        this._insertError = 'Table not found';
        return this;
      }

      const idField = this.tableName.replace('workshop_app.', '').replace(/s$/, '_id');
      const results = [];

      for (const data of this._insertData) {
        // Use existing id, id field, or generate new one
        let pkValue = data.id || data[idField];
        if (!pkValue) {
          pkValue = uuidv4();
        }

        const record = {
          ...data,
          [idField]: pkValue,
          id: data.id || pkValue,
          created_at: data.created_at || new Date().toISOString(),
          updated_at: data.updated_at || new Date().toISOString(),
        };

        // Store by either id or idField (prefer id if available)
        const storeKey = data.id || pkValue;
        table.set(storeKey, record);
        results.push(record);
      }

      this._insertResults = results;
      this._isInsertChain = true;
      return this;
    }

    // Called from select() chain
    this._fields = fields;
    return this;
  }

  eq(column, value) {
    if (this._updateData) {
      // Called from update().eq() chain
      return this._executeUpdate(column, value);
    }
    // Called from select().eq() chain - support multiple filters
    this._filters.push({ column, value });
    return this;
  }

  _executeUpdate(column, value) {
    const table = db[this.tableName];
    if (!table) return { data: null, error: 'Table not found' };

    let updated = null;

    for (const [key, record] of table) {
      if (record[column] === value) {
        const merged = { ...record, ...this._updateData, updated_at: new Date().toISOString() };
        table.set(key, merged);
        updated = merged;
        break;
      }
    }

    return { data: updated, error: updated ? null : 'Not found' };
  }

  order(column, options = {}) {
    this._orderBy = { column, options };
    return this;
  }

  async single() {
    // Handle insert().select().single() - return first inserted record
    if (this._isInsertChain && this._insertResults) {
      if (this._insertError) return { data: null, error: this._insertError };
      return { data: this._insertResults[0] || null, error: null };
    }

    const table = db[this.tableName];
    if (!table) return { data: null, error: 'Table not found' };

    let results = Array.from(table.values());

    // Apply all filters
    for (const filter of this._filters) {
      results = results.filter((r) => r[filter.column] === filter.value);
    }

    const result = results[0] || null;
    return { data: result, error: result ? null : 'Not found' };
  }

  insert(data) {
    this._insertData = Array.isArray(data) ? data : [data];
    // Mark that we're in insert mode - defer execution until select() or then()
    this._mode = 'insert';

    // Return a thenable that can be awaited
    const self = this;
    return {
      then: function(onFulfilled, onRejected) {
        return self._executeInsertDirect().then(onFulfilled, onRejected);
      },
      select: () => self.select(),
      // Make this object look like a QueryBuilder for chaining
      [Symbol.iterator]: self[Symbol.iterator],
    };
  }

  then(onFulfilled, onRejected) {
    if (this._mode === 'insert') {
      // Execute insert without select chaining
      return this._executeInsertDirect().then(onFulfilled, onRejected);
    }
    // Otherwise use execute()
    return this.execute().then(onFulfilled, onRejected);
  }

  async _executeInsertDirect() {
    const table = db[this.tableName];
    if (!table) {
      return { data: null, error: 'Table not found' };
    }

    const idField = this.tableName.replace('workshop_app.', '').replace(/s$/, '_id');
    const results = [];

    for (const data of this._insertData) {
      // Use existing id, id field, or generate new one
      let pkValue = data.id || data[idField];
      if (!pkValue) {
        pkValue = uuidv4();
      }

      const record = {
        ...data,
        [idField]: pkValue,
        id: data.id || pkValue,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
      };

      // Store by either id or idField (prefer id if available)
      const storeKey = data.id || pkValue;
      table.set(storeKey, record);
      results.push(record);
    }

    return { data: results, error: null };
  }

  update(data) {
    this._updateData = data;
    return this;
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

    // Apply all filters
    for (const filter of this._filters) {
      results = results.filter((r) => r[filter.column] === filter.value);
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
