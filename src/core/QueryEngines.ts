// This class handles all the "heavy lifting":
// index storage, index logic, and query execution.

import { BTree } from '../structures/btree';
import {
    Document,
    IndexType,
    IndexOptions,
    Query,
    QueryOperators
} from './types';

export class QueryEngine<T extends Document> {
    // Index metadata
    private indexTypes: Map<string, IndexType>;
    private uniqueKeys: Set<string>;
    private bTreeDegree: number;

    // Index storage
    private hashIndexes: Record<string, Map<any, number[]>>;
    private btreeIndexes: Record<string, BTree<any, number[]>>;

    constructor(indexOptions: IndexOptions[], bTreeDegree: number = 2) {
        this.uniqueKeys = new Set<string>();
        this.bTreeDegree = bTreeDegree;

        this.indexTypes = new Map<string, IndexType>();
        this.hashIndexes = {};
        this.btreeIndexes = {};

        if (indexOptions) {
            for (const option of indexOptions) {
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

    // --- Public Indexing Methods (called by SonicDB) ---

    public addToIndexes(doc: T, numericalIndex: number): void {
        for (const key of this.indexTypes.keys()) {
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

    public removeFromIndexes(doc: T, numericalIndex: number): void {
        for (const key of this.indexTypes.keys()) {
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

    public checkUniqueness(doc: Partial<T>, existingDocIndex: number = -1): void {
    if (this.uniqueKeys.size === 0) return;
    for (const key of this.uniqueKeys) {
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

    public clearAllIndexes(): void {
        this.indexTypes.forEach((type, key) => {
            if (type === 'hash') this.hashIndexes[key].clear();
            else if (type === 'btree') this.btreeIndexes[key] = new BTree(this.bTreeDegree);
        });
    }

    // --- Public Query Methods (called by SonicDB) ---

    /**
     * The actual query execution logic.
     * This is called by SonicDB's _findIndices (which manages the cache).
     */
    public runQuery(query: Query<T>, data: (T | null)[]): number[] {
        const results: number[] = [];
        const queryKeys = Object.keys(query) as string[];

        if (queryKeys.length === 0) {
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== null) results.push(i);
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
                const doc = data[index]; // Use passed-in data
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
                const doc = data[index]; // Use passed-in data
                if (doc === null) continue;
                if (this.docMatchesQuery(doc, query)) results.push(index);
            }
            return results;
        }

        console.warn(`SonicDB Warning: Query is not acceleratable by any index. Performing full scan:`, query);
        for (let i = 0; i < data.length; i++) {
            const doc = data[i]; // Use passed-in data
            if (doc === null) continue;
            if (this.docMatchesQuery(doc, query)) results.push(i);
        }
        return results;
    }

    /**
     * [Private] Checks if a doc matches a query.
     * This is called by runQuery.
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
}