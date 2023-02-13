export default class CacheContainer {
  storageName: string;
  quickStorage: string;
  persistent: boolean;

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

  getKey(_key: string): any {
    let data = null as any;
    if (this.persistent)
      data = localStorage.getItem(this.getStorageKey());
    else
      data = `${this.quickStorage}`;
    if (!data) return null;
    let parsedData = JSON.parse(data) as any;
    let foundValue = parsedData[_key];
    if (foundValue) return foundValue;
  }

  setKey(_key: string | null, _content: any): boolean {
    if (!_key) return false;
    let wroteData = {} as any;
    let data = null as any;
    if (this.persistent)
      data = localStorage.getItem(this.getStorageKey());
    else
      data = `${this.quickStorage}`;
    if (data) wroteData = JSON.parse(data);
    wroteData[_key] = _content;
    if (this.persistent)
      localStorage.setItem(this.getStorageKey(), JSON.stringify(wroteData));
    else
      this.quickStorage = JSON.stringify(wroteData);
    return true;
  }
}