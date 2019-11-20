import fixturify = require('fixturify');
import tmp = require('tmp');
import fs = require('fs');
import path = require('path');

tmp.setGracefulCleanup();

function keys(object: any) {
  if (object !== null && (typeof object === 'object' || Array.isArray(object))) {
    return Object.keys(object);
  } else {
    return [];
  }
}

interface DirJSON {
  [filename: string]: DirJSON | string;
}

interface ProjectConstructor {
  new(name: string, version?: string, cb?: (project: Project) => void, root?: string): Project;
  fromJSON(json: DirJSON, name: string): Project;
  fromDir(root: string, name: string): Project;
}

class Project {
  pkg: any;
  files: DirJSON = {
    'index.js': `
'use strict';
module.exports = {};`
  };
  readonly isDependency = true;

  private _dependencies: { [name: string]: Project } = {};
  private _devDependencies: { [name: string]: Project } = {};
  private _root: string;
  private _tmp: tmp.SynchrounousResult | undefined;

  constructor(name: string, version = '0.0.0', cb?: (project: Project) => void, root?: string) {
    this.pkg = {
      name,
      version,
      keywords: []
    };

    this.validate();

    if (root) {
      this._root = root;
    } else {
      this._tmp = tmp.dirSync({ unsafeCleanup: true });
      this._root = fs.realpathSync(this._tmp.name);
    }

    if (typeof cb === 'function') {
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
    return this.pkg.name;
  }

  set name(value: string) {
    this.pkg.name = value;
  }

  get version(): string {
    return this.pkg.version;
  }

  set version(value: string) {
    this.pkg.version = value;
  }

  static fromJSON(json: DirJSON, name: string) {
    if (json[name] === undefined) {
      throw new Error(`${name} was expected, but not found`);
    }

    let files = JSON.parse(JSON.stringify(json[name]));
    let pkg = JSON.parse(files['package.json']);
    let nodeModules = files['node_modules'];

    // drop "special files"
    delete files['node_modules'];
    delete files['package.json'];

    let project = new this(pkg.name, pkg.version);

    keys(pkg.dependencies).forEach(dependency => {
      project.addDependency(this.fromJSON(nodeModules, dependency));
    });

    keys(pkg.devDependencies).forEach(dependency => {
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
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'UTF8'));
      let project = new this(pkg.name, pkg.version, undefined, path.dirname(root));
      project.readSync();
      return project;
    } else if (name !== undefined){
      // TODO: consider deprecating this branch
      let project = new this(name, 'x.x.x');

      project.readSync(root);
      return project;
    } else {
      throw new TypeError(`fromDir's second optional argument, when provided, must not be undefined.`);
    }
  }

  writeSync(root = this.root) {
    fixturify.writeSync(root, this.toJSON());
  }

  readSync(root = this.root) {
    let files = unwrapPackageName(fixturify.readSync(root), this.name);

    this.pkg = JSON.parse(files['package.json']);
    let nodeModules = files['node_modules'];

    // drop "special files"
    delete files['node_modules'];
    delete files['package.json'];

    this._dependencies = {};
    this._devDependencies = {};
    this.files = files;

    keys(this.pkg.dependencies).forEach(dependency => {
      this.addDependency((this.constructor as ProjectConstructor).fromJSON(nodeModules, dependency));
    });

    keys(this.pkg.devDependencies).forEach(dependency => {
      this.addDevDependency((this.constructor as ProjectConstructor).fromJSON(nodeModules, dependency));
    });
  }

  addDependency(name: string | Project, version?: string, cb?: (project: Project) => void) {
    let dep;

    if (typeof name === 'string') {
      dep = this._dependencies[name] = new (this.constructor as ProjectConstructor)(name, version, undefined, path.join(this.root, this.name, 'node_modules'));
    } else if (name.isDependency) {
      dep = this._dependencies[name.name] = name;
    } else {
      throw new TypeError('WTF');
    }

    if (typeof cb === 'function') {
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

  addDevDependency(name: string | Project, version?: string, cb?: (project: Project) => void) {
    let dep;

    if (typeof name === 'string')  {
      dep = this._devDependencies[name] = new (this.constructor as ProjectConstructor)(name, version, undefined, path.join(this.root, this.name, 'node_modules'));
    } else if (name.isDependency) {
      dep = this._devDependencies[name.name] = name;
    } else {
      throw new TypeError('WTF');
    }

    if (typeof cb === 'function') {
      cb(dep);
    }

    return dep;
  }

  dependencies() {
    return Object.keys(this._dependencies).map(dependency => this._dependencies[dependency]);
  }

  devDependencies() {
    return Object.keys(this._devDependencies).map(dependency => this._devDependencies[dependency]);
  }

  validate() {
    if (typeof this.name !== 'string') {
      throw new TypeError('Missing name');
    }

    if (typeof this.version !== 'string') {
      throw new TypeError(`${this.name} is missing a version`);
    }

    this.dependencies().forEach(dep => dep.validate());
    this.devDependencies().forEach(dep => dep.validate());
  }

  toJSON(): DirJSON
  toJSON(key: string): DirJSON | string
  toJSON(key?: string) {
    if (key) {
      return (unwrapPackageName(this.toJSON(), this.name) as DirJSON)[key];
    } else {
      return wrapPackageName(this.name, Object.assign({}, this.files, {
        'node_modules': depsAsObject([
          ...this.devDependencies(),
          ...this.dependencies()
        ]),
        'package.json': JSON.stringify(Object.assign(this.pkg, {
          dependencies: depsToObject(this.dependencies()),
          devDependencies: depsToObject(this.devDependencies()),
        }), null, 2),
      }));
    }
  }

  clone() {
    return (this.constructor as ProjectConstructor).fromJSON(this.toJSON(), this.name);
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
  let obj: { [name: string]: string | DirJSON } = {};
  modules.forEach(dep => {
    Object.assign(obj, dep.toJSON());
  });
  return obj;
}

function depsToObject(deps: Project[]) {
  let obj: { [name: string]: string } = {};
  deps.forEach(dep => obj[dep.name] = dep.version);
  return obj;
}

function unwrapPackageName(obj: any, packageName: string) {
  let scoped = parseScoped(packageName);
  if (scoped) {
    return obj[scoped.scope][scoped.name];
  }
  return obj[packageName];
}

function wrapPackageName(packageName: string, value: any) {
  let scoped = parseScoped(packageName);
  if (scoped) {
    return { [scoped.scope]: { [scoped.name]: value } };
  } else {
    return {
      [packageName]: value
    };
  }

}

export = Project;