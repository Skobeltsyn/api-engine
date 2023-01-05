export default class CacheContainer {
  storageName: string;

  constructor(_storageName: string) {
    this.storageName = _storageName;
  }

  getStorageKey() {
    return `${this.storageName}_storage`;
  }

  getKey(_key: string): any {
    let data = localStorage.getItem(this.getStorageKey());
    if (!data) return null;
    let parsedData = JSON.parse(data) as any;
    let foundValue = parsedData[_key];
    if (foundValue) return foundValue;
  }

  setKey(_key: string | null, _content: any): boolean {
    if (!_key) return false;
    let wroteData = {} as any;
    let data = localStorage.getItem(this.getStorageKey());
    if (data) wroteData = JSON.parse(data);
    wroteData[_key] = _content;
    localStorage.setItem(this.getStorageKey(), JSON.stringify(wroteData));
    return true;
  }
}