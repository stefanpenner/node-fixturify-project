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
    this.isDependency = true;
  }

  static fromJSON(name, json) {
    let files = JSON.parse(JSON.stringify(json[name]));
    let pkg = JSON.parse(files['package.json']);
    let nodeModules = files['node_modules'];

    // drop "special files"
    delete files['node_modules'];
    delete files['package.json'];

    let project = new this(pkg.name, pkg.version);

    Object.keys(pkg.dependencies).forEach(dependency => {
      project.addDependency(this.fromJSON(dependency, nodeModules));
    });

    Object.keys(pkg.devDependencies).forEach(dependency => {
      project.addDevDependency(this.fromJSON(dependency, nodeModules));
    });

    project.files = files;

    return project;
  }

  writeSync(root) {
    fixturify.writeSync(root, this.toJSON());
  }

  readSync(root) {
    // TODO: this will update the current state of dependency from root;
    throw new Error('NotImplementedYet');
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
        'package.json': JSON.stringify({
          name: this.name,
          version: this.version,
          keywords: this.keywords,
          dependencies: depsToObject(this.dependencies()),
          devDependencies: depsToObject(this.devDependencies()),
        }, null, 2),
      }, this.files),
    };
  }

  clone() {
    return this.constructor.fromJSON(this.name, this.toJSON());
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
