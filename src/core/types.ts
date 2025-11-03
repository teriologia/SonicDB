// --- Base Types ---
export type Document = Record<string, any>;
export type SchemaDefinition = Record<
  string,
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ArrayConstructor
  | ObjectConstructor
>;

// --- Indexing Types ---
export type IndexType = 'hash' | 'btree';
export type IndexObject = {
  key: string;
  unique?: boolean;
  type?: IndexType;
};
export type IndexOptions = string | IndexObject;

// --- Querying Types ---
export type QueryOperators<T_Field> = {
  $gt?: T_Field; $gte?: T_Field; $lt?: T_Field; $lte?: T_Field;
  $ne?: T_Field; $in?: T_Field[]; $nin?: T_Field[];
};
export type Query<T> = {
  [K in keyof T]?: T[K] | QueryOperators<T[K]>;
};

// --- Main Class Options ---
export interface SonicDBOptions {
  schema?: SchemaDefinition;
  indexOn?: IndexOptions[];
  bTreeDegree?: number;
  enableQueryCache?: boolean;
}

// --- Hook Types ---
export type HookEvent = 'create' | 'update' | 'delete';
export type PreCreateCallback<T> = (doc: T) => void;
export type PostCreateCallback<T> = (doc: T) => void;
export type PreUpdateCallback<T> = (query: Query<T>, update: Partial<T>) => void;
export type PostUpdateCallback<T> = (query: Query<T>, result: { modifiedCount: number }) => void;
export type PreDeleteCallback<T> = (query: Query<T>) => void;
export type PostDeleteCallback<T> = (query: Query<T>, result: { deletedCount: number }) => void;


/**
 * A function that, when called, stops the subscription.
 */
export type UnsubscribeFn = () => void;

/**
 * An object returned by .subscribe()
 */
export interface Subscription {
  unsubscribe: UnsubscribeFn;
}

/**
 * The internal object we store to track active subscriptions
 */
export interface InternalSubscription<T> {
  query: Query<T>;
  callback: (results: T[]) => void;
}