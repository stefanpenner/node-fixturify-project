import fixturify = require('fixturify');
import tmp = require('tmp');
import fs = require('fs');
import path = require('path');
import resolve = require('resolve');
import getCallerFile = require('get-caller-file');

tmp.setGracefulCleanup();

function keys(object: any) {
  if (object !== null && (typeof object === 'object' || Array.isArray(object))) {
    return Object.keys(object);
  } else {
    return [];
  }
}

interface ProjectConstructor {
  new(name: string, version?: string, cb?: (project: Project) => void, root?: string, link?: string): Project;
  fromJSON(json: fixturify.DirJSON, name: string): Project;
  fromDir(root: string, name: string): Project;
}

class Project {
  pkg: any;
  files: fixturify.DirJSON = {
    'index.js': `
'use strict';
module.exports = {};`
  };
  readonly isDependency = true;
  readonly link?: string;

  private _dependencies: { [name: string]: Project } = {};
  private _devDependencies: { [name: string]: Project } = {};
  private _root: string;
  private _tmp: tmp.SynchrounousResult | undefined;

  constructor(name: string, version = '0.0.0', cb?: (project: Project) => void, root?: string, link?: string) {
    this.pkg = {
      name,
      version,
      keywords: []
    };

    if (typeof link === 'string') {
      this.link = link;
    }
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

  static fromJSON(json: fixturify.DirJSON, name: string) {
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

  static fromDir(root: string, name: string) {
    let project = new this(name, 'x.x.x');

    project.readSync(root);

    return project;
  }

  writeSync(root = this.root) {
    fixturify.writeSync(root, this.toJSON());
  }

  readSync(root = this.root) {
    let files = fixturify.readSync(root)[this.name];

    let pkg = JSON.parse(files['package.json']);
    let nodeModules = files['node_modules'];

    // drop "special files"
    delete files['node_modules'];
    delete files['package.json'];

    this.name = pkg.name;
    this.version = pkg.version;

    this._dependencies = {};
    this._devDependencies = {};
    this.files = files;

    keys(pkg.dependencies).forEach(dependency => {
      this.addDependency((this.constructor as ProjectConstructor).fromJSON(nodeModules, dependency));
    });

    keys(pkg.devDependencies).forEach(dependency => {
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

  linkDependency(name: string, link?: string) {
    const root = path.join(this.root, this.name, 'node_modules')
    const basedir = path.dirname(getCallerFile());
    const actualLink = typeof link === 'string' ? resolve.sync(link, { basedir }) : undefined;
    const project = new (this.constructor as ProjectConstructor)(name, '*', undefined, root, actualLink);
    this.addDependency(project);
  }

  linkDevDependency(name: string, link?: string) {
    const root = path.join(this.root, this.name, 'node_modules')
    const basedir = path.dirname(getCallerFile());
    const actualLink = typeof link === 'string' ? resolve.sync(link, { basedir }) : undefined;
    const project = new (this.constructor as ProjectConstructor)(name, '*', undefined, root, actualLink);
    this.addDevDependency(project);
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

  toJSON(): fixturify.DirJSON
  toJSON(key: string): fixturify.DirJSON | string
  toJSON(key?: string) {
    if (key) {
      return (this.toJSON()[this.name] as fixturify.DirJSON)[key];
    } else {
      if (this.link) {
        return {
          [this.name]: { __fixturify_symlink_to__: this.link }
        };
      }
      return {
        [this.name]: Object.assign({}, this.files, {
          'node_modules': depsAsObject([
            ...this.devDependencies(),
            ...this.dependencies()
          ]),
          'package.json': JSON.stringify(Object.assign(this.pkg, {
            dependencies: depsToObject(this.dependencies()),
            devDependencies: depsToObject(this.devDependencies()),
          }), null, 2),
        }),
      };
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
  let matched = name.match(/@([^@\/]+)\/(.*)/);
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
  modules.forEach(dep => {
    let scoped = parseScoped(dep.name);
    if (scoped) {
      let root = obj['@' + scoped.scope] = obj['@' + scoped.scope] || {};
      (root as fixturify.DirJSON)[scoped.name] = dep.toJSON()[dep.name];
    } else {
      obj[dep.name] = dep.toJSON()[dep.name];
    }
  });
  return obj;
}

function depsToObject(deps: Project[]) {
  let obj: { [name: string]: string } = {};
  deps.forEach(dep => obj[dep.name] = dep.version);
  return obj;
}

export = Project;