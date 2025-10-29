// src/index.ts

// --- (Types and Interfaces remain the same) ---
type Document = Record<string, any>;
type SchemaDefinition = Record<
  string,
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ArrayConstructor
  | ObjectConstructor
>;
type IndexOptions = string | { key: string; unique?: boolean };
type QueryOperators<T_Field> = {
  $gt?: T_Field; $gte?: T_Field; $lt?: T_Field; $lte?: T_Field;
  $ne?: T_Field; $in?: T_Field[]; $nin?: T_Field[];
};
type Query<T> = {
  [K in keyof T]?: T[K] | QueryOperators<T[K]>;
};
interface SonicDBOptions {
  schema?: SchemaDefinition;
  indexOn?: IndexOptions[];
}

// --- NEW: Define Hook Types ---
type HookEvent = 'create' | 'update' | 'delete';
// Callback function types for type-safety
type PreCreateCallback<T> = (doc: T) => void;
type PostCreateCallback<T> = (doc: T) => void;
type PreUpdateCallback<T> = (query: Query<T>, update: Partial<T>) => void;
type PostUpdateCallback<T> = (query: Query<T>, result: { modifiedCount: number }) => void;
type PreDeleteCallback<T> = (query: Query<T>) => void;
type PostDeleteCallback<T> = (query: Query<T>, result: { deletedCount: number }) => void;


/**
 * SonicDB Main Class
 */
class SonicDB<T extends Document = Document> {
  private schema: SchemaDefinition;
  private uniqueKeys: Set<string>;
  private indexKeys: string[];
  private data: (T | null)[];
  private indexes: Record<string, Map<any, number[]>>;

  // NEW: Storage for all registered hooks
  private hooks: { [key: string]: Function[] } = {};

  // (constructor remains the same as step 2)
  constructor(options: SonicDBOptions = {}) {
    this.schema = options.schema || {};
    this.indexKeys = [];
    this.uniqueKeys = new Set<string>();
    this.data = [];
    this.indexes = {};

    if (options.indexOn) {
      for (const option of options.indexOn) {
        let key: string;
        let isUnique = false;
        if (typeof option === 'string') key = option;
        else { key = option.key; if (option.unique) isUnique = true; }
        this.indexKeys.push(key);
        if (isUnique) this.uniqueKeys.add(key);
        if (!this.indexes[key]) this.indexes[key] = new Map<any, number[]>();
      }
    }
  }

  // --- NEW: PRIVATE HOOK RUNNER ---

  /**
   * [Private] Runs all registered hooks for a specific event.
   */
  private _runHooks(key: string, ...args: any[]): void {
    const fns = this.hooks[key];
    if (fns) {
      for (const fn of fns) {
        try {
          fn(...args);
        } catch (error) {
          console.error(`SonicDB Hook Error (${key}): ${(error as Error).message}`);
        }
      }
    }
  }

  // --- (Private validation methods remain the same) ---
  // _validate, _checkUniqueness
  // ... (Omitted for brevity, they are unchanged from step 2) ...
  private _validate(doc: Partial<T>): void {
    if (!this.schema || Object.keys(this.schema).length === 0) return;
    for (const key in this.schema) {
      if (doc.hasOwnProperty(key)) {
        const expectedType = this.schema[key];
        const actualValue = doc[key as keyof T];
        let typeIsValid = false;
        switch (expectedType) {
          case String: typeIsValid = typeof actualValue === 'string'; break;
          case Number: typeIsValid = typeof actualValue === 'number'; break;
          case Boolean: typeIsValid = typeof actualValue === 'boolean'; break;
          case Array: typeIsValid = Array.isArray(actualValue); break;
          case Object: typeIsValid = typeof actualValue === 'object' && actualValue !== null && !Array.isArray(actualValue); break;
        }
        if (!typeIsValid) throw new Error(`Schema Validation Failed: '${key}' must be of type '${expectedType.name}'. Received: ${typeof actualValue}`);
      }
    }
  }
  private _checkUniqueness(doc: Partial<T>, existingDocIndex: number = -1): void {
    if (this.uniqueKeys.size === 0) return;
    for (const key of this.uniqueKeys) {
      if (doc.hasOwnProperty(key)) {
        const value = doc[key as keyof T];
        const indexMap = this.indexes[key];
        if (indexMap && indexMap.has(value)) {
          const matchingIndices = indexMap.get(value) as number[];
          const conflict = matchingIndices.some(index => index !== existingDocIndex);
          if (conflict) throw new Error(`Uniqueness Constraint Failed: A document with key '${key}' and value '${value}' already exists.`);
        }
      }
    }
  }

  // --- (Private query methods remain the same) ---
  // _addToIndexes, _removeFromIndexes, docMatchesQuery, _findIndices, _findIndex
  // ... (Omitted for brevity, they are unchanged) ...
  private _addToIndexes(doc: T, numericalIndex: number): void {
    for (const key of this.indexKeys) {
      if (key in doc) {
        const value = doc[key as keyof T];
        const indexList = this.indexes[key].get(value) || [];
        indexList.push(numericalIndex);
        this.indexes[key].set(value, indexList);
      }
    }
  }
  private _removeFromIndexes(doc: T, numericalIndex: number): void {
    for (const key of this.indexKeys) {
      if (key in doc) {
        const value = doc[key as keyof T];
        const indexList = this.indexes[key].get(value);
        if (indexList) {
          const newList = indexList.filter(i => i !== numericalIndex);
          if (newList.length > 0) this.indexes[key].set(value, newList);
          else this.indexes[key].delete(value);
        }
      }
    }
  }
  private docMatchesQuery(doc: T, query: Query<T>): boolean {
    for (const key in query) {
      const docValue = doc[key as keyof T];
      const queryValue = query[key as keyof T];
      if (typeof queryValue === 'object' && queryValue !== null && !Array.isArray(queryValue)) {
        const operators = Object.keys(queryValue) as (keyof QueryOperators<any>)[];
        for (const op of operators) {
          const opValue = queryValue[op];
          switch (op) {
            case '$gt': if (!(docValue > opValue)) return false; break;
            case '$gte': if (!(docValue >= opValue)) return false; break;
            case '$lt': if (!(docValue < opValue)) return false; break;
            case '$lte': if (!(docValue <= opValue)) return false; break;
            case '$ne': if (!(docValue !== opValue)) return false; break;
            case '$in': if (!Array.isArray(opValue) || !opValue.includes(docValue)) return false; break;
            case '$nin': if (!Array.isArray(opValue) || opValue.includes(docValue)) return false; break;
            default: console.warn(`SonicDB Warning: Unknown operator "${op}". Ignoring.`);
          }
        }
      } else {
        if (docValue !== queryValue) return false;
      }
    }
    return true;
  }
  private _findIndices(query: Query<T>): number[] {
    const results: number[] = [];
    const queryKeys = Object.keys(query) as (keyof T)[];
    if (queryKeys.length === 0) {
      for (let i = 0; i < this.data.length; i++) {
        if (this.data[i] !== null) results.push(i);
      }
      return results;
    }
    const bestIndexKey = queryKeys.find(key => {
      if (!this.indexes.hasOwnProperty(key as string)) return false;
      const queryValue = query[key];
      if (typeof queryValue !== 'object' || queryValue === null) return true;
      if (queryValue.$in) return true;
      return false;
    });
    if (bestIndexKey) {
      const queryValue = query[bestIndexKey];
      const indexMap = this.indexes[bestIndexKey as string];
      const candidateIndices = new Set<number>();
      if (typeof queryValue === 'object' && queryValue !== null && queryValue.$in) {
        for (const val of queryValue.$in) {
          const indices = indexMap.get(val);
          if (indices) indices.forEach(i => candidateIndices.add(i));
        }
      } else {
        const indices = indexMap.get(queryValue);
        if (indices) indices.forEach(i => candidateIndices.add(i));
      }
      for (const index of candidateIndices) {
        const doc = this.data[index];
        if (doc === null) continue;
        if (this.docMatchesQuery(doc, query)) results.push(index);
      }
      return results;
    }
    console.warn(`SonicDB Warning: Query is not acceleratable by index. Performing full scan:`, query);
    for (let i = 0; i < this.data.length; i++) {
      const doc = this.data[i];
      if (doc === null) continue;
      if (this.docMatchesQuery(doc, query)) results.push(i);
    }
    return results;
  }
  private _findIndex(query: Query<T>): number {
    const indices = this._findIndices(query);
    return indices.length > 0 ? indices[0] : -1;
  }


  // --- NEW: PUBLIC HOOK REGISTRATION METHODS ---

  /**
   * Register a 'pre' hook to run before a 'create', 'update', or 'delete' operation.
   * 'pre' hooks can modify the data before it is saved.
   */
  public pre(event: 'create', fn: PreCreateCallback<T>): void;
  public pre(event: 'update', fn: PreUpdateCallback<T>): void;
  public pre(event: 'delete', fn: PreDeleteCallback<T>): void;
  public pre(event: HookEvent, fn: Function): void {
    const key = `pre:${event}`;
    if (!this.hooks[key]) {
      this.hooks[key] = [];
    }
    this.hooks[key].push(fn);
  }

  /**
   * Register a 'post' hook to run after a 'create', 'update', or 'delete' operation.
   * 'post' hooks receive the result of the operation.
   */
  public post(event: 'create', fn: PostCreateCallback<T>): void;
  public post(event: 'update', fn: PostUpdateCallback<T>): void;
  public post(event: 'delete', fn: PostDeleteCallback<T>): void;
  public post(event: HookEvent, fn: Function): void {
    const key = `post:${event}`;
    if (!this.hooks[key]) {
      this.hooks[key] = [];
    }
    this.hooks[key].push(fn);
  }


  // --- PUBLIC API METHODS (UPDATED TO TRIGGER HOOKS) ---

  /**
   * UPDATED: Now triggers 'pre:create' and 'post:create' hooks.
   */
  public create(doc: T): T {
    // 1. Run 'pre:create' hooks. They can modify 'doc'.
    this._runHooks(`pre:create`, doc);

    // 2. Validate
    this._validate(doc);
    this._checkUniqueness(doc, -1);
    
    // 3. Create
    const newIndex = this.data.length;
    this.data.push(doc);
    this._addToIndexes(doc, newIndex);
    
    // 4. Run 'post:create' hooks.
    this._runHooks(`post:create`, doc);
    
    return doc;
  }

  // (loadData remains unchanged, it will trigger 'create' hooks)
  public loadData(dataArray: T[]): void {
    this.data = [];
    for (const key of this.indexKeys) this.indexes[key].clear();
    for (const doc of dataArray) {
      this.create(doc);
    }
    console.log(`SonicDB: ${this.data.length} documents loaded and indexed.`);
  }

  // (find/findOne remain unchanged, we are not adding find hooks yet)
  public findOne(query: Query<T>): T | null {
    const index = this._findIndex(query);
    return (index !== -1 && this.data[index]) ? this.data[index] as T : null;
  }
  public find(query: Query<T>): T[] {
    const indices = this._findIndices(query);
    return indices
      .map(index => this.data[index])
      .filter(doc => doc !== null) as T[];
  }

  /**
   * UPDATED: Now triggers 'pre:update' and 'post:update' hooks.
   */
  public updateOne(query: Query<T>, update: Partial<T>): T | null {
    // 1. Run 'pre:update' hooks. They can modify 'update'.
    this._runHooks(`pre:update`, query, update);

    const indexToUpdate = this._findIndex(query);
    if (indexToUpdate === -1) {
      // 2. Run 'post:update' hook even on failure
      this._runHooks(`post:update`, query, { modifiedCount: 0 });
      return null;
    }

    // 3. Validate
    this._validate(update);
    this._checkUniqueness(update, indexToUpdate);

    // 4. Update
    const oldDoc = this.data[indexToUpdate] as T;
    this._removeFromIndexes(oldDoc, indexToUpdate);
    const newDoc = { ...oldDoc, ...update };
    this.data[indexToUpdate] = newDoc;
    this._addToIndexes(newDoc, indexToUpdate);

    // 5. Run 'post:update' hook
    this._runHooks(`post:update`, query, { modifiedCount: 1 });
    
    return newDoc;
  }

  /**
   * UPDATED: Now triggers 'pre:update' and 'post:update' hooks.
   */
  public updateMany(query: Query<T>, update: Partial<T>): { modifiedCount: number } {
    // 1. Run 'pre:update' hooks once.
    this._runHooks(`pre:update`, query, update);

    // 2. Validate
    this._validate(update);
    
    const indicesToUpdate = this._findIndices(query);
    let modifiedCount = 0;
    
    for (const index of indicesToUpdate) {
      try {
        // 3. Check uniqueness
        this._checkUniqueness(update, index);
        
        // 4. Update
        const oldDoc = this.data[index] as T;
        this._removeFromIndexes(oldDoc, index);
        const newDoc = { ...oldDoc, ...update };
        this.data[index] = newDoc;
        this._addToIndexes(newDoc, index);
        modifiedCount++;
      } catch (error) {
        console.error(`SonicDB Error: Could not update document at index ${index} due to: ${(error as Error).message}`);
      }
    }
    
    // 5. Run 'post:update' hook once
    const result = { modifiedCount };
    this._runHooks(`post:update`, query, result);
    
    return result;
  }

  /**
   * UPDATED: Now triggers 'pre:delete' and 'post:delete' hooks.
   */
  public deleteOne(query: Query<T>): { deletedCount: number } {
    // 1. Run 'pre:delete' hook
    this._runHooks(`pre:delete`, query);
    
    const indexToDelete = this._findIndex(query);
    if (indexToDelete === -1) {
      this._runHooks(`post:delete`, query, { deletedCount: 0 });
      return { deletedCount: 0 };
    }

    // 2. Delete
    const docToDelete = this.data[indexToDelete] as T;
    this._removeFromIndexes(docToDelete, indexToDelete);
    this.data[indexToDelete] = null;
    
    // 3. Run 'post:delete' hook
    const result = { deletedCount: 1 };
    this._runHooks(`post:delete`, query, result);
    
    return result;
  }

  /**
   * UPDATED: Now triggers 'pre:delete' and 'post:delete' hooks.
   */
  public deleteMany(query: Query<T>): { deletedCount: number } {
    // 1. Run 'pre:delete' hook
    this._runHooks(`pre:delete`, query);
    
    const indicesToDelete = this._findIndices(query);
    if (indicesToDelete.length === 0) {
      this._runHooks(`post:delete`, query, { deletedCount: 0 });
      return { deletedCount: 0 };
    }
    
    // 2. Delete
    for (const index of indicesToDelete) {
      const docToDelete = this.data[index] as T;
      this._removeFromIndexes(docToDelete, index);
      this.data[index] = null;
    }
    
    // 3. Run 'post:delete' hook
    const result = { deletedCount: indicesToDelete.length };
    this._runHooks(`post:delete`, query, result);
    
    return result;
  }
}

export default SonicDB;