declare module 'bin-links' {
    const m: ((opts: any) => Promise<void> | Promise<[any, any]>) & {
        checkBins: any;
        resetSeen: () => void;
        getPaths: any;
    };
    export = m;
}