'use strict';

const fixturify = require('fixturify');

module.exports = class Project {
  constructor(name, version) {
    this.pkg = {
      name,
      version,
      keywords: []
    };

    this._dependencies = {};
    this._devDependencies = {};
    this.validate();
    this.files = {};
    this.isDependency = true;
  }

  get name() {
    return this.pkg.name;
  }

  set name(value) {
    this.pkg.name = value;
  }

  get version() {
    return this.pkg.version;
  }

  set version(value) {
    this.pkg.version = value;
  }

  static fromJSON(json, name) {
    let files = JSON.parse(JSON.stringify(json[name]));
    let pkg = JSON.parse(files['package.json']);
    let nodeModules = files['node_modules'];

    // drop "special files"
    delete files['node_modules'];
    delete files['package.json'];

    let project = new this(pkg.name, pkg.version);

    Object.keys(pkg.dependencies).forEach(dependency => {
      project.addDependency(this.fromJSON(nodeModules, dependency));
    });

    Object.keys(pkg.devDependencies).forEach(dependency => {
      project.addDevDependency(this.fromJSON(nodeModules, dependency));
    });

    project.files = files;

    return project;
  }

  static fromDir(root, name) {
    let project = new this(name, 'x.x.x');

    project.readSync(root);

    return project;
  }

  writeSync(root) {
    fixturify.writeSync(root, this.toJSON());
  }

  readSync(root) {
    let files = fixturify.readSync(root)[this.name];

    let pkg = JSON.parse(files['package.json']);
    let nodeModules = files['node_modules'];

    // drop "special files"
    delete files['node_modules'];
    delete files['package.json'];

    this.name = pkg.name;
    this.version = pkg.version;
    this.keywords = pkg.keywords;

    this._dependencies = {};
    this._devDependencies = {};
    this.files = files;

    Object.keys(pkg.dependencies).forEach(dependency => {
      this.addDependency(this.constructor.fromJSON(nodeModules, dependency));
    });

    Object.keys(pkg.devDependencies).forEach(dependency => {
      this.addDevDependency(this.constructor.fromJSON(nodeModules, dependency));
    });

  }

  addDependency(name, version, cb) {
    let dep;

    if (typeof name === 'string') {
      dep = this._dependencies[name] = new this.constructor(name, version);
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

  addDevDependency(name, version, cb) {
    let dep;

    if (typeof name === 'string')  {
      dep = this._devDependencies[name] = new this.constructor(name, version);
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

  addFile(file, contents) {
    if (file === 'package.json') {
      throw new Error('cannot add package.json');
    }

    this.files[file] = contents;
  }

  toJSON() {
    return {
      [this.name]: Object.assign({
        'node_modules': depsAsObject([
          ...this.devDependencies(),
          ...this.dependencies()
        ]),
        'package.json': JSON.stringify(Object.assign(this.pkg, {
          dependencies: depsToObject(this.dependencies()),
          devDependencies: depsToObject(this.devDependencies()),
        }), null, 2),
      }, this.files),
    };
  }

  clone() {
    return this.constructor.fromJSON(this.toJSON(), this.name);
  }
}

function depsAsObject(modules) {
  let obj = {};
  modules.forEach(dep => obj[dep.name] = dep.toJSON()[dep.name]);
  return obj;
}

function depsToObject(deps) {
  let obj = {};
  deps.forEach(dep => obj[dep.name] = dep.version);
  return obj;
}
