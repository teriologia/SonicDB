
import { QueryEngine } from './core/QueryEngines';

import {
  Document,
  SchemaDefinition,
  Query,
  SonicDBOptions,
  HookEvent,
  PreCreateCallback,
  PostCreateCallback,
  PreUpdateCallback,
  PostUpdateCallback,
  PreDeleteCallback,
  PostDeleteCallback,
  Subscription,
  InternalSubscription,
  PersistencePlugin
} from './core/types';


/**
 * SonicDB Main Class
 * The public-facing API and "orchestrator" for the database.
 */
class SonicDB<T extends Document = Document> {
  // --- Core Systems ---
  private engine: QueryEngine<T>;
  private schema: SchemaDefinition;

  // --- Data & State ---
  private data: (T | null)[];

  // --- Add-on Systems ---
  private hooks: { [key: string]: Function[] } = {};
  private queryCache: Map<string, number[]>;
  private cacheEnabled: boolean;

  // --- Reactivity Property ---
  private subscriptions: InternalSubscription<T>[] = [];

  //NEW: persistance options
  private persistencePlugin: PersistencePlugin<T> | null = null;

  constructor(options: SonicDBOptions = {}) {
    this.schema = options.schema || {};
    this.data = [];
    this.hooks = {};

    // Initialize Cache
    this.cacheEnabled = options.enableQueryCache ?? true;
    this.queryCache = new Map<string, number[]>();

    // Initialize the Engine
    this.engine = new QueryEngine<T>(
      options.indexOn || [],
      options.bTreeDegree || 2
    );
  }

  // --- PRIVATE HELPERS (Cache, Validation, Hooks) ---

  private _notifyChanges(): void {
    // 1. Invalidate the static query cache
    if (this.cacheEnabled) {
      this.queryCache.clear();
      // console.log("SonicDB Debug: Query cache invalidated.");
    }

    // 2. Notify all active subscribers (Reactivity)
    if (this.subscriptions.length > 0) {
      // console.log(`SonicDB Debug: Notifying ${this.subscriptions.length} subscribers.`);

      // Re-run every active "live" query
      for (const sub of this.subscriptions) {
        try {
          // Re-run the query. This will be a cache-miss
          const newResults = this.find(sub.query);

          sub.callback(newResults);
        } catch (error) {
          console.error(`SonicDB Error: Failed to update subscription for query:`, sub.query, error);
        }
      }
    }
  }

  /**
   * [Private] Validates a document (or part of one) against the schema.
   */
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

        if (!typeIsValid) {
          throw new Error(`Schema Validation Failed: '${key}' must be of type '${expectedType.name}'. Received: ${typeof actualValue}`);
        }
      }
    }
  }

  /**
   * [Private] Runs all registered hooks for a specific event.
   */
  private _runHooks(key: string, ...args: any[]): void {
    const fns = this.hooks[key];
    if (fns) {
      for (const fn of fns) {
        try { fn(...args); }
        catch (error) { console.error(`SonicDB Hook Error (${key}): ${(error as Error).message}`); }
      }
    }
  }
  /**
   * [Private] Creates a fast, simple (but naive) cache key from a query object.
   * Faster than JSON.stringify
   * NOTE: Does not handle key order (e.g., {a:1, b:2} != {b:2, a:1})
   */
  private _getCacheKey(query: Query<T>): string {
    let key = '';
    for (const k in query) {
      const v = query[k as keyof T];
      if (typeof v === 'object' && v !== null) {
        key += `${k}:`;
        for (const op in (v as any)) {
          key += `$${op}:${(v as any)[op]}_`;
        }
      } else {
        key += `${k}:${v}_`;
      }
    }
    return key;
  }

  /**
   * [Private] Finds all indices, using the cache if enabled.
   */
  private _findIndices(query: Query<T>): number[] {
    if (this.cacheEnabled) {
      const cacheKey = this._getCacheKey(query);
      const cachedResult = this.queryCache.get(cacheKey);

      if (cachedResult) {
        return cachedResult; // Cache HIT
      }

      // Cache MISS
      const results = this.engine.runQuery(query, this.data);
      this.queryCache.set(cacheKey, results);
      return results;

    } else {
      // Cache is disabled
      return this.engine.runQuery(query, this.data);
    }
  }

  /**
   * [Private] Finds the first index.
   */
  private _findIndex(query: Query<T>): number {
    const indices = this._findIndices(query);
    return indices.length > 0 ? indices[0] : -1;
  }

  private async _triggerAutoSave(): Promise<void> {
        if (this.persistencePlugin) {
             this.save().catch(error => {
                 console.error("SonicDB Auto-Save Failed:", error);
             });
        }
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

  public create(doc: T): T {
    this._runHooks(`pre:create`, doc);
    this._validate(doc);
    this.engine.checkUniqueness(doc, -1);

    const newIndex = this.data.length;
    this.data.push(doc);
    this.engine.addToIndexes(doc, newIndex);

    this._notifyChanges();
    this._runHooks(`post:create`, doc);
    this._triggerAutoSave();
    return doc;
  }

  public loadData(dataArray: T[]): void {
    this.data = [];
    this.engine.clearAllIndexes();

    for (let i = 0; i < dataArray.length; i++) {
      const doc = dataArray[i];
      this.data.push(doc);
      this.engine.addToIndexes(doc, i);
    }

    this._notifyChanges(); // UPDATED
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
    this.engine.checkUniqueness(update, indexToUpdate);

    const oldDoc = this.data[indexToUpdate] as T;
    this.engine.removeFromIndexes(oldDoc, indexToUpdate);

    const newDoc = { ...oldDoc, ...update };
    this.data[indexToUpdate] = newDoc;

    this.engine.addToIndexes(newDoc, indexToUpdate);

    this._notifyChanges();
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
        this.engine.checkUniqueness(update, index);
        const oldDoc = this.data[index] as T;
        this.engine.removeFromIndexes(oldDoc, index);
        const newDoc = { ...oldDoc, ...update };
        this.data[index] = newDoc;
        this.engine.addToIndexes(newDoc, index);
        modifiedCount++;
      } catch (error) {
        console.error(`SonicDB Error: Could not update document at index ${index} due to: ${(error as Error).message}`);
      }
    }

    if (modifiedCount > 0) {
      this._notifyChanges();
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
    this.engine.removeFromIndexes(docToDelete, indexToDelete);
    this.data[indexToDelete] = null;

    this._notifyChanges();
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
      this.engine.removeFromIndexes(docToDelete, index);
      this.data[index] = null;
    }

    this._notifyChanges();
    const result = { deletedCount: indicesToDelete.length };
    this._runHooks(`post:delete`, query, result);
    return result;
  }

  public find$(query: Query<T>): { subscribe: (callback: (results: T[]) => void) => Subscription } {
    // 'this' refers to the SonicDB instance
    const db = this;

    const observable = {
      subscribe: (callback: (results: T[]) => void): Subscription => {
        // 1. Create the subscription object
        const subscription: InternalSubscription<T> = {
          query: query,
          callback: callback
        };

        // 2. Add it to the main list
        db.subscriptions.push(subscription);

        // 3. Run the query immediately with the initial data
        try {
          const initialResults = db.find(query);
          callback(initialResults);
        } catch (error) {
          console.error("SonicDB Error: Failed to run initial query for subscription:", error);
        }

        // 4. Return the 'unsubscribe' method
        return {
          unsubscribe: () => {
            // Remove this subscription from the list
            const index = db.subscriptions.indexOf(subscription);
            if (index > -1) {
              db.subscriptions.splice(index, 1);
            }
          }
        };
      }
    };

    return observable;
  }

  // persist section NEW!
  public usePersistence(plugin: PersistencePlugin<T>): void {
    this.persistencePlugin = plugin;
    console.log(`SonicDB: Persistence plugin '${plugin.name}' registered.`);
  }

  public async loadPersistentData(): Promise<boolean> {
    if (!this.persistencePlugin) {
      console.warn("SonicDB: No persistence plugin is registered.");
      return false;
    }

    const loadedData = await this.persistencePlugin.loadData();

    if (loadedData && loadedData.length > 0) {
      this.loadData(loadedData);
      console.log(`SonicDB: Successfully loaded ${loadedData.length} documents from persistence.`);
      return true;
    }

    console.log("SonicDB: No persistent data found. Starting with empty database.");
    return false;
  }

  public async save(): Promise<void> {
        if (!this.persistencePlugin) return;

        const dataToSave = this.data.filter(doc => doc !== null) as T[];

        await this.persistencePlugin.saveData(dataToSave);
        console.log(`SonicDB: Successfully saved ${dataToSave.length} documents.`);
    }

} // --- End of SonicDB Class ---

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