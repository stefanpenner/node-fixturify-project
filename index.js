'use strict';
const fixturify = require('fixturify');

module.exports = class Project {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.keywords = [];
    this._dependencies = {};
    this._devDependencies = {};
    this.validate();
    this.files = {};
  }

  writeSync(root) {
    fixturify.writeSync(root, this.toJSON());
  }

  readSync(root) {
    // TODO: this will update the current state of dependency from root;
    throw new Error('NotImplementedYet');
  }

  addDependency(name, version, cb) {
    let dep = this._dependencies[name] = new this.constructor(name, version);

    if (typeof cb === 'function') {
      cb(dep);
    }

    return dep;
  }

  addDevDependency(name, version, cb) {
    let dep = this._devDependencies[name] = new this.constructor(name, version);

    if (typeof cb === 'function') {
      cb(dep);
    }

    return dep;
  }

  addDependencies(dependencies) {
    Object.keys(dependencies).forEach(name => this.addDependency(name, dependencies[name]));
  }

  addDevDependencies(dependencies) {
    Object.keys(dependencies).forEach(name => this.addDevDependency(name, dependencies[name]));
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
      [this.name]: {
        'node_modules': depsAsObject([...this.devDependencies(), ...this.dependencies()]),
        'package.json': JSON.stringify({
          name: this.name,
          version: this.version,
          keywords: this.keywords,
          dependencies: depsToObject(this.dependencies()),
          devDependencies: depsToObject(this.devDependencies()),
        }, null, 2),
        ...this.files
      },
    };
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
