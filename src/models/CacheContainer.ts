import { log } from "../util/Log";

/**
 * Simple key/value cache backed by localStorage (or in-memory string when
 * {@link persistent} is false). Used by ApiEngine to memoize responses for
 * `asyncFetchWithCache`.
 */
export default class CacheContainer {
  storageName: string;
  quickStorage: string;
  persistent: boolean;
  /** Optional cap on entries; oldest entries are evicted on overflow. */
  public maxEntries: number = Infinity;

  constructor(_storageName: string) {
    this.storageName = _storageName;
    this.quickStorage = "{}";
    this.persistent =  true;

    this.getKey = this.getKey.bind(this);
    this.getStorageKey = this.getStorageKey.bind(this);
    this.setKey = this.setKey.bind(this);
  }

  getStorageKey() {
    return `${this.storageName}_storage`;
  }

  /** Return the cached value for `_key`, or `null`/`undefined` on miss. */
  getKey(_key: string): any {
    let data = null as any;
    if (this.persistent) {
      log(`Looking in localStorage`);
      data = localStorage.getItem(this.getStorageKey());
    }
    else {
      log(`Looking in quickStorage`);
      data = `${this.quickStorage}`;
    }
    if (!data) return null;
    let parsedData = {} as any;

    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      return undefined;
    }

    let foundValue = parsedData[_key];
    if (foundValue) return foundValue;
  }

  /**
   * Store `_content` under `_key`. Honors {@link maxEntries} via
   * insertion-order eviction. Returns `false` if `_key` is null/empty.
   */
  setKey(_key: string | null, _content: any): boolean {
    if (!_key) return false;
    let wroteData = {} as any;
    let data = null as any;
    if (this.persistent)
      data = localStorage.getItem(this.getStorageKey());
    else
      data = `${this.quickStorage}`;
    if (data) wroteData = JSON.parse(data);
    if (!Object.prototype.hasOwnProperty.call(wroteData, _key) && Number.isFinite(this.maxEntries)) {
      const keys = Object.keys(wroteData);
      while (keys.length >= this.maxEntries) {
        const oldest = keys.shift();
        if (oldest !== undefined) delete wroteData[oldest];
      }
    }
    wroteData[_key] = _content;
    if (this.persistent)
      localStorage.setItem(this.getStorageKey(), JSON.stringify(wroteData));
    else
      this.quickStorage = JSON.stringify(wroteData);
    return true;
  }
}