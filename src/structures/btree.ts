// A full, self-balancing B-Tree implementation, written in pure TypeScript.

// --- BTreeNode Class ---
// Represents a single node in the B-Tree
class BTreeNode<K, V> {
  public keys: K[] = [];
  public values: V[] = [];
  public children: BTreeNode<K, V>[] = [];
  public leaf: boolean = true;
  
  // Reference to the parent tree, used to get 't'
  public tree: BTree<K, V>;

  constructor(tree: BTree<K, V>) {
    this.tree = tree;
  }

  /**
   * Finds the first child that must contain the key.
   */
  private findChildIndex(key: K): number {
    let idx = 0;
    while (idx < this.keys.length && key > this.keys[idx]) {
      idx++;
    }
    return idx;
  }

  /**
   * Searches for a key in the subtree rooted with this node.
   */
  public search(key: K): V | undefined {
    let idx = 0;
    while (idx < this.keys.length && key > this.keys[idx]) {
      idx++;
    }

    if (idx < this.keys.length && key === this.keys[idx]) {
      return this.values[idx];
    }
    if (this.leaf) {
      return undefined;
    }
    return this.children[idx].search(key);
  }

  /**
   * (COMPLEX) Traverses a range of keys (for $gt, $lt, etc.)
   */
  public range(
    range: { $gt?: K; $gte?: K; $lt?: K; $lte?: K },
    callback: (key: K, value: V) => void
  ): void {
    
    // Find the first index to start searching from
    let idx = 0;
    while (idx < this.keys.length) {
      const key = this.keys[idx];
      // Check if key is too small
      const tooSmall = (range.$gt != null && !(key > range.$gt)) || 
                       (range.$gte != null && !(key >= range.$gte));
      if (tooSmall) {
        idx++;
      } else {
        break; // Start from this key or its left child
      }
    }    
    // 1. Visit the left child of the starting key
    if (!this.leaf) {
      this.children[idx].range(range, callback);
    }

    // 2. Iterate through the keys in this node
    while (idx < this.keys.length) {
      const key = this.keys[idx];
      
      // Check if we've gone past the upper bound
      const tooLarge = (range.$lt != null && !(key < range.$lt)) || 
                       (range.$lte != null && !(key <= range.$lte));

      if (tooLarge) {
        return; // Range is finished, stop.
      }

      // This key is in range
      callback(key, this.values[idx]);

      // 3. Visit the right child
      idx++;
      if (!this.leaf) {
        this.children[idx].range(range, callback);
      }
    }
  }

  /**
   * Inserts a new key into a non-full node.
   */
  public insertNonFull(key: K, value: V): void {
    let idx = this.keys.length - 1;

    if (this.leaf) {
      // Find location for new key
      while (idx >= 0 && key < this.keys[idx]) {
        this.keys[idx + 1] = this.keys[idx];
        this.values[idx + 1] = this.values[idx];
        idx--;
      }
      // Insert new key and value
      this.keys[idx + 1] = key;
      this.values[idx + 1] = value;
    } else {
      // Find the child which is going to have the new key
      while (idx >= 0 && key < this.keys[idx]) {
        idx--;
      }
      idx++;
      
      // Check if the found child is full
      if (this.children[idx].keys.length === (2 * this.tree.t) - 1) {
        this._splitChild(idx);
        if (key > this.keys[idx]) {
          idx++;
        }
      }
      this.children[idx].insertNonFull(key, value);
    }
  }

  /**
   * Splits a full child node. (Must be public)
   */
  public _splitChild(idx: number): void {
    const t = this.tree.t;
    const childToSplit = this.children[idx];
    const newSibling = new BTreeNode<K, V>(this.tree);
    newSibling.leaf = childToSplit.leaf;

    // Create new sibling node
    newSibling.keys = childToSplit.keys.splice(t);
    newSibling.values = childToSplit.values.splice(t);

    if (!childToSplit.leaf) {
      newSibling.children = childToSplit.children.splice(t);
    }

    // Update this (parent) node
    this.children.splice(idx + 1, 0, newSibling);
    this.keys.splice(idx, 0, childToSplit.keys.pop()!);
    this.values.splice(idx, 0, childToSplit.values.pop()!);
  }
  
  /**
   * Deletes a key from the subtree rooted at this node.
   */
  public delete(key: K): void {
    const t = this.tree.t;
    let idx = this.findChildIndex(key);
    
    // 1. Key is in this node
    if (idx < this.keys.length && this.keys[idx] === key) {
      if (this.leaf) {
        this.keys.splice(idx, 1);
        this.values.splice(idx, 1);
      } else {
        this._deleteFromInternal(idx);
      }
    } else {
      // 2. Key is not in this node, recurse
      if (this.leaf) {
        return; // Key not in tree
      }
      
      const isLastChild = (idx === this.keys.length);
      const child = this.children[idx];

      if (child.keys.length < t) {
        this._fill(idx);
      }
      
      if (isLastChild && idx > this.keys.length) {
        this.children[idx - 1].delete(key);
      } else {
        this.children[idx].delete(key);
      }
    }
  }

  // --- Deletion Helper Methods ---
  
  public _deleteFromInternal(idx: number): void {
    const t = this.tree.t;
    const key = this.keys[idx];
    const prevChild = this.children[idx];
    const nextChild = this.children[idx + 1];

    if (prevChild.keys.length >= t) {
      const { key: predKey, value: predValue } = this._getPredecessor(idx);
      this.keys[idx] = predKey;
      this.values[idx] = predValue;
      prevChild.delete(predKey);
    } else if (nextChild.keys.length >= t) {
      const { key: succKey, value: succValue } = this._getSuccessor(idx);
      this.keys[idx] = succKey;
      this.values[idx] = succValue;
      nextChild.delete(succKey);
    } else {
      this._merge(idx);
      prevChild.delete(key);
    }
  }
  
  public _getPredecessor(idx: number): { key: K, value: V } {
    let current = this.children[idx];
    while (!current.leaf) {
      current = current.children[current.keys.length];
    }
    return { 
      key: current.keys[current.keys.length - 1], 
      value: current.values[current.values.length - 1] 
    };
  }
  
  public _getSuccessor(idx: number): { key: K, value: V } {
    let current = this.children[idx + 1];
    while (!current.leaf) {
      current = current.children[0];
    }
    return { key: current.keys[0], value: current.values[0] };
  }
  
  public _fill(idx: number): void {
    const t = this.tree.t;
    if (idx !== 0 && this.children[idx - 1].keys.length >= t) {
      this._borrowFromPrev(idx);
    } else if (idx !== this.keys.length && this.children[idx + 1].keys.length >= t) {
      this._borrowFromNext(idx);
    } else {
      if (idx !== this.keys.length) {
        this._merge(idx);
      } else {
        this._merge(idx - 1);
      }
    }
  }

  public _borrowFromPrev(idx: number): void {
    const child = this.children[idx];
    const sibling = this.children[idx - 1];
    child.keys.unshift(this.keys[idx - 1]);
    child.values.unshift(this.values[idx - 1]);
    if (!child.leaf) {
      child.children.unshift(sibling.children.pop()!);
    }
    this.keys[idx - 1] = sibling.keys.pop()!;
    this.values[idx - 1] = sibling.values.pop()!;
  }
  
  public _borrowFromNext(idx: number): void {
    const child = this.children[idx];
    const sibling = this.children[idx + 1];
    child.keys.push(this.keys[idx]);
    child.values.push(this.values[idx]);
    if (!child.leaf) {
      child.children.push(sibling.children.shift()!);
    }
    this.keys[idx] = sibling.keys.shift()!;
    this.values[idx] = sibling.values.shift()!;
  }

  public _merge(idx: number): void {
    const child = this.children[idx];
    const sibling = this.children[idx + 1];
    child.keys.push(this.keys[idx]);
    child.values.push(this.values[idx]);
    child.keys = child.keys.concat(sibling.keys);
    child.values = child.values.concat(sibling.values);
    if (!child.leaf) {
      child.children = child.children.concat(sibling.children);
    }
    this.keys.splice(idx, 1);
    this.values.splice(idx, 1);
    this.children.splice(idx + 1, 1);
  }
}

// --- BTree Class (The main export) ---
export class BTree<K, V> {
  public root: BTreeNode<K, V> | null = null;
  public readonly t: number; // Minimum degree

  /**
   * @param t Minimum degree (default 2). Max keys = 2*t - 1. Min keys = t - 1.
   */
  constructor(t: number = 2) {
    if (t < 2) throw new Error("B-Tree degree 't' must be at least 2.");
    this.t = t;
    this.root = new BTreeNode<K, V>(this);
  }
  
  /**
   * Search for a key
   */
  public search(key: K): V | undefined {
    return this.root?.search(key);
  }
  
  /**
   * Insert a new key-value pair
   */
  public insert(key: K, value: V): void {
    if (!this.root) {
      this.root = new BTreeNode<K, V>(this);
    }
    const r = this.root!;
    
    // Check if key already exists (to make it a Map, not a MultiMap)
    let current: BTreeNode<K, V> | null = this.root;
    while (current) {
        let idx = current.keys.findIndex(k => k === key);
        if (idx !== -1) {
            current.values[idx] = value; // Update existing value
            return;
        }
        // Go deeper
        idx = 0;
        while (idx < current.keys.length && key > current.keys[idx]) {
            idx++;
        }
        if (current.leaf) current = null;
        else current = current.children[idx];
    }
    
    // If key not found, proceed with insertion
    if (r.keys.length === (2 * this.t) - 1) {
      const newRoot = new BTreeNode<K, V>(this);
      newRoot.leaf = false;
      newRoot.children[0] = r;
      this.root = newRoot;
      newRoot._splitChild(0); 
      newRoot.insertNonFull(key, value);
    } else {
      r.insertNonFull(key, value);
    }
  }
  
  /**
   * Delete a key
   */
  public delete(key: K): void {
    if (!this.root) return;
    
    this.root.delete(key);

    if (this.root.keys.length === 0 && !this.root.leaf) {
      this.root = this.root.children[0];
    }
  }
  
  /**
   * (SIMPLE) Perform a range query
   */
  public range(
    range: { $gt?: K; $gte?: K; $lt?: K; $lte?: K },
    callback: (key: K, value: V) => void
  ): void {
    this.root?.range(range, callback);
  }
}