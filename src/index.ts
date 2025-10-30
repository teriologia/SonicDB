import { BTree } from './structures/btree';

// --- Types and Interfaces ---
type Document = Record<string, any>;
// Define a schema as a map of field names to constructors
type SchemaDefinition = Record<
  string,
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ArrayConstructor
  | ObjectConstructor
>;
type IndexType = 'hash' | 'btree';
type IndexObject = {
  key: string;
  unique?: boolean;
  type?: IndexType;
};
type IndexOptions = string | IndexObject;

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
  bTreeDegree?: number; // Allow configuration of 't'
  enableQueryCache?: boolean; // Option to turn caching on/off
}
// Hook types
type HookEvent = 'create' | 'update' | 'delete';
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
  
  private indexTypes: Map<string, IndexType>;
  private hashIndexes: Record<string, Map<any, number[]>>;
  private btreeIndexes: Record<string, BTree<any, number[]>>;
  private bTreeDegree: number;
  
  private data: (T | null)[];
  private hooks: { [key: string]: Function[] } = {};

  // --- Query Cache Properties ---
  private queryCache: Map<string, number[]>;
  private cacheEnabled: boolean;
  // --- End of Cache Properties ---

  constructor(options: SonicDBOptions = {}) {
    this.schema = options.schema || {};
    this.uniqueKeys = new Set<string>();
    this.data = [];
    this.hooks = {};
    this.bTreeDegree = options.bTreeDegree || 2;
    
    // Initialize Cache
    this.cacheEnabled = options.enableQueryCache ?? true; // Default to ON
    this.queryCache = new Map<string, number[]>();
    
    this.indexTypes = new Map<string, IndexType>();
    this.hashIndexes = {};
    this.btreeIndexes = {};

    if (options.indexOn) {
      for (const option of options.indexOn) {
        let key: string, isUnique = false, type: IndexType = 'hash';
        if (typeof option === 'string') key = option;
        else { key = option.key; if (option.unique) isUnique = true; if (option.type) type = option.type; }
        
        this.indexTypes.set(key, type);
        if (isUnique) this.uniqueKeys.add(key);

        if (type === 'hash') {
          this.hashIndexes[key] = new Map<any, number[]>();
        } else if (type === 'btree') {
          this.btreeIndexes[key] = new BTree<any, number[]>(this.bTreeDegree);
        }
      }
    }
  }

  // --- PRIVATE CACHE INVALIDATION ---
  
  /**
   * [Private] Clears the query cache.
   * Called by any method that modifies data (create, update, delete).
   */
  private _invalidateCache(): void {
    if (this.cacheEnabled) {
      this.queryCache.clear();
      // console.log("SonicDB Debug: Query cache invalidated.");
    }
  }

  // --- PRIVATE VALIDATION & UNIQUENESS HELPERS ---

  /**
   * [Private] Validates a document (or part of one) against the schema.
   */
  private _validate(doc: Partial<T>): void {
    if (!this.schema || Object.keys(this.schema).length === 0) {
      return; // No schema defined, skip validation
    }
    
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
        
        if (!typeIsValid) {
          throw new Error(`Schema Validation Failed: '${key}' must be of type '${expectedType.name}'. Received: ${typeof actualValue}`);
        }
      }
    }
  }

  /**
   * [Private] Checks a document (or part of one) for uniqueness violations.
   */
  private _checkUniqueness(doc: Partial<T>, existingDocIndex: number = -1): void {
    if (this.uniqueKeys.size === 0) return;
    for (const key of this.uniqueKeys) {
      if (doc.hasOwnProperty(key)) {
        const value = doc[key as keyof T];
        const type = this.indexTypes.get(key);
        let indexList: number[] | undefined;

        if (type === 'hash') {
          indexList = this.hashIndexes[key]?.get(value);
        } else if (type === 'btree') {
          indexList = this.btreeIndexes[key]?.search(value);
        }
        
        if (indexList) {
          const conflict = indexList.some(index => index !== existingDocIndex);
          if (conflict) {
            throw new Error(`Uniqueness Constraint Failed: A document with key '${key}' and value '${value}' already exists.`);
          }
        }
      }
    }
  }


  // --- PRIVATE INDEXING HELPERS ---

  private _addToIndexes(doc: T, numericalIndex: number): void {
    for (const key of this.indexTypes.keys()) {
      if (doc.hasOwnProperty(key)) {
        const value = doc[key as keyof T];
        const type = this.indexTypes.get(key);

        if (type === 'hash') {
          const indexMap = this.hashIndexes[key];
          const indexList = indexMap.get(value) || [];
          indexList.push(numericalIndex);
          indexMap.set(value, indexList);
        } 
        else if (type === 'btree') {
          const indexTree = this.btreeIndexes[key];
          const indexList = indexTree.search(value) || [];
          indexList.push(numericalIndex);
          indexTree.insert(value, indexList);
        }
      }
    }
  }

  private _removeFromIndexes(doc: T, numericalIndex: number): void {
    for (const key of this.indexTypes.keys()) {
      if (doc.hasOwnProperty(key)) {
        const value = doc[key as keyof T];
        const type = this.indexTypes.get(key);

        if (type === 'hash') {
          const indexMap = this.hashIndexes[key];
          const indexList = indexMap.get(value);
          if (indexList) {
            const newList = indexList.filter(i => i !== numericalIndex);
            if (newList.length > 0) indexMap.set(value, newList);
            else indexMap.delete(value);
          }
        } 
        else if (type === 'btree') {
          const indexTree = this.btreeIndexes[key];
          const indexList = indexTree.search(value);
          if (indexList) {
            const newList = indexList.filter(i => i !== numericalIndex);
            if (newList.length > 0) {
              indexTree.insert(value, newList);
            } else {
              indexTree.delete(value);
            }
          }
        }
      }
    }
  }

  // --- PRIVATE QUERY ENGINE ---
  
  /**
   * [Private] The actual query logic (formerly _findIndices).
   * This is now separate so _findIndices can manage the cache.
   */
  private _runQuery(query: Query<T>): number[] {
    const results: number[] = [];
    const queryKeys = Object.keys(query) as string[];
    
    if (queryKeys.length === 0) {
      for (let i = 0; i < this.data.length; i++) {
        if (this.data[i] !== null) results.push(i);
      }
      return results;
    }
    
    let bestPath: { key: string, type: IndexType, operator: string } | null = null;
    let bestPathRank = 3; 

    for (const key of queryKeys) {
      const keyType = this.indexTypes.get(key);
      if (!keyType) continue; 
      const queryValue = query[key as keyof T];
      const isOperatorObject = typeof queryValue === 'object' && queryValue !== null && !Array.isArray(queryValue);

      if (keyType === 'hash') {
        if (!isOperatorObject || (queryValue as any).$in) {
          bestPath = { key, type: 'hash', operator: isOperatorObject ? '$in' : 'exact' };
          bestPathRank = 1;
          break;
        }
      } 
      else if (keyType === 'btree') {
        if (!isOperatorObject || Object.keys(queryValue).some(op => ['$in', '$gt', '$gte', '$lt', '$lte', '$ne'].includes(op))) {
          if (bestPathRank > 2) {
            bestPath = { key, type: 'btree', operator: 'range' };
            bestPathRank = 2;
          }
        }
      }
    }
    
    // --- QUERY EXECUTION ---
    
    if (bestPath?.type === 'hash') {
      const indexMap = this.hashIndexes[bestPath.key];
      const queryValue = query[bestPath.key as keyof T] as any;
      const candidateIndices = new Set<number>();
      if (bestPath.operator === '$in' && Array.isArray(queryValue.$in)) {
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
    
    if (bestPath?.type === 'btree') {
      const indexTree = this.btreeIndexes[bestPath.key];
      const queryValue = query[bestPath.key as keyof T];
      const candidateIndices = new Set<number>();
      const op = (typeof queryValue === 'object' && queryValue !== null) ? (queryValue as any) : { 'exact': queryValue };
      
      if (op.exact) {
        const indices = indexTree.search(op.exact);
        if (indices) indices.forEach(i => candidateIndices.add(i));
      } else if (op.$in) {
        for (const val of op.$in) {
          const indices = indexTree.search(val);
          if (indices) indices.forEach(i => candidateIndices.add(i));
        }
      } else {
        const range = { $gt: op.$gt, $gte: op.$gte, $lt: op.$lt, $lte: op.$lte };
        indexTree.range(range, (key, values) => {
          values.forEach(i => candidateIndices.add(i));
        });
        if (op.$ne !== undefined) {
          indexTree.range({}, (key, values) => {
            if (key !== op.$ne) values.forEach(i => candidateIndices.add(i));
          });
        }
      }
      for (const index of candidateIndices) {
        const doc = this.data[index];
        if (doc === null) continue;
        if (this.docMatchesQuery(doc, query)) results.push(index);
      }
      return results;
    }

    console.warn(`SonicDB Warning: Query is not acceleratable by any index. Performing full scan:`, query);
    for (let i = 0; i < this.data.length; i++) {
      const doc = this.data[i];
      if (doc === null) continue;
      if (this.docMatchesQuery(doc, query)) results.push(i);
    }
    return results;
  }
  
  /**
   * [Private] Finds all indices, using the cache if enabled.
   */
  private _findIndices(query: Query<T>): number[] {
    if (this.cacheEnabled) {
      const cacheKey = JSON.stringify(query);
      const cachedResult = this.queryCache.get(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }
      
      const results = this._runQuery(query);
      this.queryCache.set(cacheKey, results);
      return results;

    } else {
      return this._runQuery(query);
    }
  }

  /**
   * [Private] Finds the first index, using the cache logic (less efficient).
   */
  private _findIndex(query: Query<T>): number {
    const indices = this._findIndices(query);
    return indices.length > 0 ? indices[0] : -1;
  }
  
  /**
   * [Private] Checks if a doc matches a query.
   */
  private docMatchesQuery(doc: T, query: Query<T>): boolean {
    for (const key in query) {
      if (query.hasOwnProperty(key)) {
        const docValue = doc[key as keyof T];
        const queryValue = query[key as keyof T];
        
        if (typeof queryValue === 'object' && queryValue !== null && !Array.isArray(queryValue)) {
          const operators = Object.keys(queryValue) as (keyof QueryOperators<any>)[];
          for (const op of operators) {
            const opValue = (queryValue as any)[op];
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
    }
    return true;
  }
  
  // --- PUBLIC API METHODS (Hooks + CRUD) ---

  public pre(event: HookEvent, fn: Function): void {
    const key = `pre:${event}`;
    if (!this.hooks[key]) this.hooks[key] = [];
    this.hooks[key].push(fn);
  }
  public post(event: HookEvent, fn: Function): void {
    const key = `post:${event}`;
    if (!this.hooks[key]) this.hooks[key] = [];
    this.hooks[key].push(fn);
  }
  private _runHooks(key: string, ...args: any[]): void {
    const fns = this.hooks[key];
    if (fns) {
      for (const fn of fns) {
        try { fn(...args); }
        catch (error) { console.error(`SonicDB Hook Error (${key}): ${(error as Error).message}`); }
      }
    }
  }

  public create(doc: T): T {
    this._runHooks(`pre:create`, doc);
    this._validate(doc);
    this._checkUniqueness(doc, -1); 
    const newIndex = this.data.length;
    this.data.push(doc);
    this._addToIndexes(doc, newIndex);
    this._invalidateCache(); 
    this._runHooks(`post:create`, doc);
    return doc;
  }

  public loadData(dataArray: T[]): void {
    this.data = [];
    this.indexTypes.forEach((type, key) => {
      if (type === 'hash') this.hashIndexes[key].clear();
      else if (type === 'btree') this.btreeIndexes[key] = new BTree(this.bTreeDegree);
    });
    for (let i = 0; i < dataArray.length; i++) {
        const doc = dataArray[i];
        this.data.push(doc);
        this._addToIndexes(doc, i);
    }
    this._invalidateCache(); 
    console.log(`SonicDB: ${this.data.length} documents loaded and indexed.`);
  }

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

  public updateOne(query: Query<T>, update: Partial<T>): T | null {
    this._runHooks(`pre:update`, query, update);
    const indexToUpdate = this._findIndex(query);
    if (indexToUpdate === -1) {
      this._runHooks(`post:update`, query, { modifiedCount: 0 });
      return null;
    }
    this._validate(update);
    this._checkUniqueness(update, indexToUpdate);
    const oldDoc = this.data[indexToUpdate] as T;
    this._removeFromIndexes(oldDoc, indexToUpdate);
    const newDoc = { ...oldDoc, ...update };
    this.data[indexToUpdate] = newDoc;
    this._addToIndexes(newDoc, indexToUpdate);
    this._invalidateCache(); 
    this._runHooks(`post:update`, query, { modifiedCount: 1 });
    return newDoc;
  }

  public updateMany(query: Query<T>, update: Partial<T>): { modifiedCount: number } {
    this._runHooks(`pre:update`, query, update);
    this._validate(update);
    const indicesToUpdate = this._findIndices(query);
    let modifiedCount = 0;
    
    if (indicesToUpdate.length === 0) {
       this._runHooks(`post:update`, query, { modifiedCount: 0 });
       return { modifiedCount: 0 };
    }
    
    for (const index of indicesToUpdate) {
      try {
        this._checkUniqueness(update, index);
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
    
    if (modifiedCount > 0) {
        this._invalidateCache(); 
    }
    
    const result = { modifiedCount };
    this._runHooks(`post:update`, query, result);
    return result;
  }

  public deleteOne(query: Query<T>): { deletedCount: number } {
    this._runHooks(`pre:delete`, query);
    const indexToDelete = this._findIndex(query);
    if (indexToDelete === -1) {
      this._runHooks(`post:delete`, query, { deletedCount: 0 });
      return { deletedCount: 0 };
    }
    const docToDelete = this.data[indexToDelete] as T;
    this._removeFromIndexes(docToDelete, indexToDelete);
    this.data[indexToDelete] = null;
    this._invalidateCache(); 
    const result = { deletedCount: 1 };
    this._runHooks(`post:delete`, query, result);
    return result;
  }

  public deleteMany(query: Query<T>): { deletedCount: number } {
    this._runHooks(`pre:delete`, query);
    const indicesToDelete = this._findIndices(query);
    if (indicesToDelete.length === 0) {
      this._runHooks(`post:delete`, query, { deletedCount: 0 });
      return { deletedCount: 0 };
    }
    for (const index of indicesToDelete) {
      const docToDelete = this.data[index] as T;
      this._removeFromIndexes(docToDelete, index);
      this.data[index] = null;
    }
    this._invalidateCache(); 
    const result = { deletedCount: indicesToDelete.length };
    this._runHooks(`post:delete`, query, result);
    return result;
  }
}

// Hook Overloads
declare interface SonicDB<T extends Document = Document> {
  pre(event: 'create', fn: PreCreateCallback<T>): void;
  pre(event: 'update', fn: PreUpdateCallback<T>): void;
  pre(event: 'delete', fn: PreDeleteCallback<T>): void;
  post(event: 'create', fn: PostCreateCallback<T>): void;
  post(event: 'update', fn: PostUpdateCallback<T>): void;
  post(event: 'delete', fn: PostDeleteCallback<T>): void;
}

export default SonicDB;