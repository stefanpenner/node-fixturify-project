import fixturify from "fixturify";
import tmp = require("tmp");
import fs = require("fs");
import path = require("path");
import { PackageJson } from "type-fest";

tmp.setGracefulCleanup();

function deserializePackageJson(serialized: string): PackageJson {
  return JSON.parse(serialized);
}

function keys(object: any) {
  if (
    object !== null &&
    (typeof object === "object" || Array.isArray(object))
  ) {
    return Object.keys(object);
  } else {
    return [];
  }
}

function getString<Obj extends Object, KeyOfObj extends keyof Obj>(
  obj: Obj,
  propertyName: KeyOfObj,
  errorMessage?: string
): string {
  const value = obj[propertyName];
  if (typeof value === "string") {
    return value;
  } else {
    throw new TypeError(
      errorMessage || `expected 'string' but got '${typeof value}'`
    );
  }
}

function cloneDirJSON(serialized: fixturify.DirJSON): fixturify.DirJSON {
  return JSON.parse(JSON.stringify(serialized));
}

/**
 A utility method access a file from a DirJSON that is type-safe and runtime safe.

```ts
getFile(folder, 'package.json') // the files content, or it will throw
```
 */
function getFile<Dir extends fixturify.DirJSON, FileName extends keyof Dir>(
  dir: Dir,
  fileName: FileName
): string {
  const value = dir[fileName];
  if (typeof value === "string") {
    return value;
  } else if (typeof value === "object" && value !== null) {
    throw new TypeError(
      `Expected a file for name '${fileName}' but got a 'Folder'`
    );
  } else {
    throw new TypeError(
      `Expected a file for name '${fileName}' but got '${typeof value}'`
    );
  }
}

/**
 A utility method access a file from a DirJSON that is type-safe and runtime safe

```ts
getFolder(folder, 'node_modules') // => the DirJSON of folder['node_module'] or it will throw
```
 */
function getFolder<Dir extends fixturify.DirJSON, FileName extends keyof Dir>(
  dir: Dir,
  fileName: FileName
): fixturify.DirJSON {
  const value = dir[fileName];

  if (isDirJSON(value)) {
    return value;
  } else if (typeof value === "string") {
    throw new TypeError(
      `Expected a file for name '${fileName}' but got 'File'`
    );
  } else {
    throw new TypeError(
      `Expected a folder for name '${fileName}' but got '${typeof value}'`
    );
  }
}

function isDirJSON(value: any): value is fixturify.DirJSON {
  return typeof value === "object" && value !== null;
}

function getPackageName(pkg: PackageJson): string {
  return getString(pkg, "name", `package.json is missing a name.`);
}

function getPackageVersion(pkg: PackageJson): string {
  return getString(
    pkg,
    "version",
    `${getPackageName(pkg)}'s package.json is missing a version.`
  );
}

interface ProjectConstructor {
  new (
    name: string,
    version?: string,
    cb?: (project: Project) => void,
    root?: string
  ): Project;
  fromJSON(json: fixturify.DirJSON, name: string): Project;
  fromDir(root: string, name: string): Project;
}

class Project {
  pkg: PackageJson;
  files: fixturify.DirJSON = {
    "index.js": `
'use strict';
module.exports = {};`,
  };
  readonly isDependency = true;

  private _dependencies: { [name: string]: Project } = {};
  private _devDependencies: { [name: string]: Project } = {};
  private _root: string;
  private _tmp: tmp.SynchrounousResult | undefined;

  constructor(
    name: string,
    version = "0.0.0",
    cb?: (project: Project) => void,
    root?: string
  ) {
    this.pkg = {
      name,
      version,
      keywords: [],
    };

    this.validate();

    if (root) {
      this._root = root;
    } else {
      this._tmp = tmp.dirSync({ unsafeCleanup: true });
      this._root = fs.realpathSync(this._tmp.name);
    }

    if (typeof cb === "function") {
      cb(this);
    }
  }

  get root() {
    return this._root;
  }

  get baseDir() {
    return path.join(this._root, this.name);
  }

  get name(): string {
    return getPackageName(this.pkg);
  }

  set name(value: string) {
    this.pkg.name = value;
  }

  get version(): string {
    return getPackageVersion(this.pkg);
  }

  set version(value: string) {
    this.pkg.version = value;
  }

  static fromJSON(json: fixturify.DirJSON, name: string) {
    const folder = getFolder(json, name);
    let files = cloneDirJSON(folder);
    let pkg = deserializePackageJson(getFile(files, "package.json"));
    let nodeModules = getFolder(files, "node_modules");

    // drop "special files"
    delete files["node_modules"];
    delete files["package.json"];

    let project = new this(getPackageName(pkg), pkg.version);

    keys(pkg.dependencies).forEach((dependency) => {
      project.addDependency(this.fromJSON(nodeModules, dependency));
    });

    keys(pkg.devDependencies).forEach((dependency) => {
      project.addDevDependency(this.fromJSON(nodeModules, dependency));
    });

    delete pkg.dependencies;
    delete pkg.devDependencies;

    project.pkg = pkg;
    project.files = files;

    return project;
  }

  static fromDir(root: string, name?: string) {
    if (arguments.length === 1) {
      const pkg = deserializePackageJson(
        fs.readFileSync(path.join(root, "package.json"), "utf-8")
      );
      const project = new this(
        getPackageName(pkg),
        pkg.version,
        undefined,
        path.dirname(root)
      );
      project.readSync();
      return project;
    } else if (name !== undefined) {
      // TODO: consider deprecating this branch
      let project = new this(name, "x.x.x");

      project.readSync(root);
      return project;
    } else {
      throw new TypeError(
        `fromDir's second optional argument, when provided, must not be undefined.`
      );
    }
  }

  writeSync(root = this.root) {
    fixturify.writeSync(root, this.toJSON());
  }

  readSync(root = this.root) {
    const files = unwrapPackageName(fixturify.readSync(root), this.name);

    this.pkg = deserializePackageJson(getFile(files, "package.json"));
    const nodeModules = getFolder(files, "node_modules");

    // drop "special files"
    delete files["node_modules"];
    delete files["package.json"];

    this._dependencies = {};
    this._devDependencies = {};
    this.files = files;

    keys(this.pkg.dependencies).forEach((dependency) => {
      this.addDependency(
        (this.constructor as ProjectConstructor).fromJSON(
          nodeModules,
          dependency
        )
      );
    });

    keys(this.pkg.devDependencies).forEach((dependency) => {
      this.addDevDependency(
        (this.constructor as ProjectConstructor).fromJSON(
          nodeModules,
          dependency
        )
      );
    });
  }

  addDependency(
    name: string | Project,
    version?: string,
    cb?: (project: Project) => void
  ) {
    let dep;

    if (typeof name === "string") {
      dep = this._dependencies[name] = new (this
        .constructor as ProjectConstructor)(
        name,
        version,
        undefined,
        path.join(this.root, this.name, "node_modules")
      );
    } else if (name.isDependency) {
      dep = this._dependencies[name.name] = name;
    } else {
      throw new TypeError("WTF");
    }

    if (typeof cb === "function") {
      cb(dep);
    }

    return dep;
  }

  removeDependency(name: string) {
    delete this._dependencies[name];
  }

  removeDevDependency(name: string) {
    delete this._devDependencies[name];
  }

  addDevDependency(
    name: string | Project,
    version?: string,
    cb?: (project: Project) => void
  ) {
    let dep;

    if (typeof name === "string") {
      dep = this._devDependencies[name] = new (this
        .constructor as ProjectConstructor)(
        name,
        version,
        undefined,
        path.join(this.root, this.name, "node_modules")
      );
    } else if (name.isDependency) {
      dep = this._devDependencies[name.name] = name;
    } else {
      throw new TypeError("WTF");
    }

    if (typeof cb === "function") {
      cb(dep);
    }

    return dep;
  }

  dependencies() {
    return Object.keys(this._dependencies).map(
      (dependency) => this._dependencies[dependency]
    );
  }

  devDependencies() {
    return Object.keys(this._devDependencies).map(
      (dependency) => this._devDependencies[dependency]
    );
  }

  validate() {
    if (typeof this.name !== "string") {
      throw new TypeError("missing name");
    }

    if (typeof this.version !== "string") {
      throw new TypeError(`${this.name} is missing a version`);
    }

    this.dependencies().forEach((dep) => dep.validate());
    this.devDependencies().forEach((dep) => dep.validate());
  }

  toJSON(): fixturify.DirJSON;
  toJSON(key: string): fixturify.DirJSON | string;
  toJSON(key?: string) {
    if (key) {
      return unwrapPackageName(this.toJSON(), this.name)[key];
    } else {
      return wrapPackageName(
        this.name,
        Object.assign({}, this.files, {
          node_modules: depsAsObject([
            ...this.devDependencies(),
            ...this.dependencies(),
          ]),
          "package.json": JSON.stringify(
            Object.assign(this.pkg, {
              dependencies: depsToObject(this.dependencies()),
              devDependencies: depsToObject(this.devDependencies()),
            }),
            null,
            2
          ),
        })
      );
    }
  }

  clone() {
    return (this.constructor as ProjectConstructor).fromJSON(
      this.toJSON(),
      this.name
    );
  }

  dispose() {
    if (this._tmp) {
      this._tmp.removeCallback();
    }
  }
}

function parseScoped(name: string) {
  let matched = name.match(/(@[^@\/]+)\/(.*)/);
  if (matched) {
    return {
      scope: matched[1],
      name: matched[2],
    };
  }
  return null;
}

function depsAsObject(modules: Project[]) {
  let obj: { [name: string]: string | fixturify.DirJSON } = {};
  modules.forEach((dep) => {
    let depJSON = dep.toJSON();
    if (dep.name.charAt(0) === "@") {
      let [scope] = dep.name.split("/");
      if (obj[scope] === undefined) {
        Object.assign(obj, depJSON);
      } else {
        Object.assign(obj[scope], depJSON[scope]);
      }
    } else {
      Object.assign(obj, depJSON);
    }
  });
  return obj;
}

function depsToObject(deps: Project[]) {
  let obj: { [name: string]: string } = {};
  deps.forEach((dep) => (obj[dep.name] = dep.version));
  return obj;
}

function unwrapPackageName(obj: any, packageName: string): fixturify.DirJSON {
  let scoped = parseScoped(packageName);
  if (scoped) {
    return getFolder(getFolder(obj, scoped.scope), scoped.name);
  }
  return getFolder(obj, packageName);
}

function wrapPackageName(packageName: string, value: any) {
  let scoped = parseScoped(packageName);
  if (scoped) {
    return { [scoped.scope]: { [scoped.name]: value } };
  } else {
    return {
      [packageName]: value,
    };
  }
}

export = Project;
