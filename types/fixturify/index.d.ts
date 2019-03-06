declare module 'fixturify' {
  export function writeSync(root: string, json: any): void;
  export function readSync(root: string): any;
}