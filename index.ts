import fixturify from 'fixturify';
import tmp = require('tmp');
import fs = require('fs-extra');
import path = require('path');
import resolvePackagePath = require('resolve-package-path');
import { PackageJson } from 'type-fest';

tmp.setGracefulCleanup();

function deserializePackageJson(serialized: string): PackageJson {
  return JSON.parse(serialized);
}

function keys(object: any) {
  if (object !== null && (typeof object === 'object' || Array.isArray(object))) {
    return Object.keys(object);
  } else {
    return [];
  }
}

function isProjectCallback(maybe: ProjectCallback | any): maybe is ProjectCallback {
  return typeof maybe === 'function';
}

function getString<Obj extends Object, KeyOfObj extends keyof Obj>(
  obj: Obj,
  propertyName: KeyOfObj,
  errorMessage?: string
): string {
  const value = obj[propertyName];
  if (typeof value === 'string') {
    return value;
  } else {
    throw new TypeError(errorMessage || `expected 'string' but got '${typeof value}'`);
  }
}

/**
 A utility method access a file from a DirJSON that is type-safe and runtime safe.

```ts
getFile(folder, 'package.json') // the files content, or it will throw
```
 */
function getFile<Dir extends fixturify.DirJSON, FileName extends keyof Dir>(dir: Dir, fileName: FileName): string {
  const value = dir[fileName];
  if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'object' && value !== null) {
    throw new TypeError(`Expected a file for name '${fileName}' but got a 'Folder'`);
  } else {
    throw new TypeError(`Expected a file for name '${fileName}' but got '${typeof value}'`);
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
  } else if (typeof value === 'string') {
    throw new TypeError(`Expected a file for name '${fileName}' but got 'File'`);
  } else {
    throw new TypeError(`Expected a folder for name '${fileName}' but got '${typeof value}'`);
  }
}

function isDirJSON(value: any): value is fixturify.DirJSON {
  return typeof value === 'object' && value !== null;
}

function getPackageName(pkg: PackageJson): string {
  return getString(pkg, 'name', `package.json is missing a name.`);
}

function getPackageVersion(pkg: PackageJson): string {
  return getString(pkg, 'version', `${getPackageName(pkg)}'s package.json is missing a version.`);
}

interface ReadDirOpts {
  linkDeps?: boolean;
}

// This only shallow-merges with any user-provided files, which is OK right now
// because this is only one level deep. If we ever make it deeper, we'll need to
// switch to a proper deep merge.
const defaultFiles = {
  'index.js': `
    'use strict';
     module.exports = {};`,
};

export interface ProjectArgs {
  name?: string;
  version?: string;
  files?: fixturify.DirJSON;
  requestedRange?: string;
}

type ProjectCallback = (project: Project) => void;
export class Project {
  pkg: PackageJson;
  files: fixturify.DirJSON;
  readonly isDependency = true;

  private _dependencies: { [name: string]: Project } = {};
  private _devDependencies: { [name: string]: Project } = {};
  private _baseDir: string | undefined;
  private _tmp: tmp.SynchrounousResult | undefined;

  // when used as a dependency in another Project, this is the semver range it
  // will appear as within the parent's package.json
  private requestedRange: string;

  private dependencyLinks: Map<string, { dir: string; requestedRange: string }> = new Map();
  private linkIsDevDependency: Set<string> = new Set();

  constructor(
    name?: string,
    version?: string,
    args?: Omit<ProjectArgs, 'name' | 'version'>,
    projectCallback?: ProjectCallback
  );
  constructor(name?: string, version?: string, args?: Omit<ProjectArgs, 'name' | 'version'>);
  constructor(name?: string, version?: string, projectCallback?: ProjectCallback);
  constructor(name?: string, args?: Omit<ProjectArgs, 'name'>, projectCallback?: ProjectCallback);
  constructor(args?: ProjectArgs, projectCallback?: ProjectCallback);
  constructor(
    first?: string | ProjectArgs,
    second?: string | Omit<ProjectArgs, 'name'> | ProjectCallback,
    third?: Omit<ProjectArgs, 'name' | 'version'> | ProjectCallback,
    fourth?: ProjectCallback
  ) {
    let name: string | undefined;
    let version: string | undefined;
    let files: fixturify.DirJSON | undefined;
    let requestedRange: string | undefined;
    if (first == null) {
      // all optional args stay undefined
    } else if (typeof first === 'string') {
      name = first;
      if (typeof second === 'string') {
        version = second;
        if (third) {
          if (!isProjectCallback(third)) {
            ({ files, requestedRange } = third);
          }
        }
      } else {
        if (second) {
          if (!isProjectCallback(second)) {
            ({ version, files, requestedRange } = second);
          }
        }
      }
    } else {
      ({ name, version, files, requestedRange } = first);
    }

    let pkg: PackageJson = {};

    if (files && typeof files?.['package.json'] === 'string') {
      pkg = JSON.parse(files['package.json']);
      files = Object.assign({}, files);
      delete files['package.json'];
    }

    this.pkg = Object.assign({}, pkg, {
      name: name || pkg.name || 'a-fixturified-project',
      version: version || pkg.version || '0.0.0',
      keywords: pkg.keywords || [],
    });
    if (files) {
      this.files = { ...defaultFiles, ...files };
    } else {
      this.files = defaultFiles;
    }
    this.requestedRange = requestedRange || this.pkg.version!;

    const arity = arguments.length;
    if (arity > 1) {
      fourth;
      const projectCallback = arguments[arity - 1];
      if (isProjectCallback(projectCallback)) {
        projectCallback(this);
      }
    }
  }

  get root() {
    throw new Error('.root has been removed, please review the readme but you likely actually want .baseDir now');
  }

  set baseDir(dir: string) {
    if (this._baseDir) {
      throw new Error(`this Project already has a baseDir`);
    }
    this._baseDir = dir;
  }

  get baseDir() {
    if (!this._baseDir) {
      throw new Error(
        `this project has no baseDir yet. Either set one manually or call writeSync to have one chosen for you`
      );
    }
    return this._baseDir;
  }

  private autoBaseDir(): string {
    if (!this._baseDir) {
      this._tmp = tmp.dirSync({ unsafeCleanup: true });
      this._baseDir = fs.realpathSync(this._tmp.name);
    }
    return this._baseDir;
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

  writeSync() {
    this.autoBaseDir();
    fixturify.writeSync(this.baseDir, this.files);
    fs.outputJSONSync(path.join(this.baseDir, 'package.json'), this.pkgJSONWithDeps(), { spaces: 2 });

    for (let [name, { dir: target }] of this.dependencyLinks) {
      fs.ensureSymlinkSync(target, path.join(this.baseDir, 'node_modules', name), 'dir');
    }
    for (let dep of this.dependencyProjects()) {
      dep.baseDir = path.join(this.baseDir, 'node_modules', dep.name);
      dep.writeSync();
    }
    for (let dep of this.devDependencyProjects()) {
      dep.baseDir = path.join(this.baseDir, 'node_modules', dep.name);
      dep.writeSync();
    }
  }

  static fromDir(root: string, opts?: ReadDirOpts): Project {
    let project = new Project();
    project.readSync(root, opts);
    return project;
  }

  private readSync(root: string, opts?: ReadDirOpts): void {
    const files = fixturify.readSync(root, {
      // when linking deps, we don't need to crawl all of node_modules
      ignore: opts?.linkDeps ? ['node_modules'] : [],
    });

    this.pkg = deserializePackageJson(getFile(files, 'package.json'));
    delete files['package.json'];
    this.files = files;

    if (opts?.linkDeps) {
      if (this.pkg.dependencies) {
        for (let dep of Object.keys(this.pkg.dependencies)) {
          this.linkDependency(dep, { baseDir: path.join(root, this.name) });
        }
      }
      if (this.pkg.devDependencies) {
        for (let dep of Object.keys(this.pkg.devDependencies)) {
          this.linkDevDependency(dep, { baseDir: path.join(root, this.name) });
        }
      }
    } else {
      const nodeModules = getFolder(files, 'node_modules');
      delete files['node_modules'];
      keys(this.pkg.dependencies).forEach(dependency => {
        this.addDependency(
          new (this.constructor as typeof Project)({ files: unwrapPackageName(nodeModules, dependency) })
        );
      });
      keys(this.pkg.devDependencies).forEach(dependency => {
        this.addDevDependency(
          new (this.constructor as typeof Project)({ files: unwrapPackageName(nodeModules, dependency) })
        );
      });
    }
  }

  addDependency(
    name?: string,
    version?: string,
    args?: Omit<ProjectArgs, 'name' | 'version'>,
    projectCallback?: ProjectCallback
  ): Project;
  addDependency(name?: string, version?: string, projectCallback?: ProjectCallback): Project;
  addDependency(name?: string, args?: Omit<ProjectArgs, 'name'>, projectCallback?: ProjectCallback): Project;
  addDependency(args?: ProjectArgs, projectCallback?: ProjectCallback): Project;
  addDependency(args?: Project, projectCallback?: ProjectCallback): Project;
  addDependency(
    first?: string | ProjectArgs | Project,
    second?: string | Omit<ProjectArgs, 'name'> | ProjectCallback,
    third?: Omit<ProjectArgs, 'name' | 'version'> | ProjectCallback,
    fourth?: ProjectCallback
  ): Project {
    let projectCallback;

    const arity = arguments.length;
    if (arity > 1) {
      fourth;
      const maybeProjectCallback = arguments[arity - 1];
      if (isProjectCallback(maybeProjectCallback)) {
        projectCallback = maybeProjectCallback;
      }
    }

    if (isProjectCallback(second)) {
      second = undefined;
    }
    if (isProjectCallback(third)) {
      third = undefined;
    }

    return this.addDep(first, second, third, '_dependencies', projectCallback);
  }

  private addDep(
    first: string | ProjectArgs | Project | undefined,
    second: string | Omit<ProjectArgs, 'name'> | undefined,
    third: Omit<ProjectArgs, 'name' | 'version'> | undefined,
    target: '_dependencies' | '_devDependencies',
    projectCallback?: ProjectCallback
  ): Project {
    let dep;
    if (first == null) {
      dep = new Project();
    } else if (typeof first === 'string') {
      let name = first;
      if (typeof second === 'string') {
        let version = second;
        dep = new Project(name, version, third, projectCallback);
      } else {
        dep = new Project(name, second, projectCallback);
      }
    } else if ('isDependency' in first) {
      dep = first;
    } else {
      dep = new Project(first, projectCallback);
    }

    this[target][dep.name] = dep;
    this.dependencyLinks.delete(dep.name);
    this.linkIsDevDependency.delete(dep.name);

    if (isProjectCallback(projectCallback)) {
      projectCallback(dep);
    }
    return dep;
  }

  removeDependency(name: string) {
    delete this._dependencies[name];
    this.dependencyLinks.delete(name);
    this.linkIsDevDependency.delete(name);
  }

  removeDevDependency(name: string) {
    delete this._devDependencies[name];
    this.dependencyLinks.delete(name);
    this.linkIsDevDependency.delete(name);
  }

  addDevDependency(
    name?: string,
    version?: string,
    args?: Omit<ProjectArgs, 'name' | 'version'>,
    projectCallback?: ProjectCallback
  ): Project;
  addDevDependency(name?: string, version?: string, projectCallback?: ProjectCallback): Project;
  addDevDependency(name?: string, args?: Omit<ProjectArgs, 'name'>, projectCallback?: ProjectCallback): Project;
  addDevDependency(args?: ProjectArgs, projectCallback?: ProjectCallback): Project;
  addDevDependency(args?: Project, projectCallback?: ProjectCallback): Project;
  addDevDependency(
    first?: string | ProjectArgs | Project,
    second?: string | Omit<ProjectArgs, 'name'> | ProjectCallback,
    third?: Omit<ProjectArgs, 'name' | 'version'> | ProjectCallback,
    fourth?: ProjectCallback
  ): Project {
    let projectCallback;

    const arity = arguments.length;
    if (arity > 1) {
      fourth;
      const maybeProjectCallback = arguments[arity - 1];
      if (isProjectCallback(maybeProjectCallback)) {
        projectCallback = maybeProjectCallback;
      }
    }

    if (isProjectCallback(second)) {
      second = undefined;
    }
    if (isProjectCallback(third)) {
      third = undefined;
    }

    return this.addDep(first, second, third, '_devDependencies', projectCallback);
  }

  linkDependency(
    name: string,
    opts:
      | { baseDir: string; resolveName?: string; requestedRange?: string }
      | { target: string; requestedRange?: string }
  ) {
    this.removeDependency(name);
    this.removeDevDependency(name);
    let dir: string;
    if ('baseDir' in opts) {
      let pkgJSONPath = resolvePackagePath(opts.resolveName || name, opts.baseDir);
      if (!pkgJSONPath) {
        throw new Error(`failed to locate ${opts.resolveName || name} in ${opts.baseDir}`);
      }
      dir = path.dirname(pkgJSONPath);
    } else {
      dir = opts.target;
    }
    let requestedRange = opts?.requestedRange ?? fs.readJsonSync(path.join(dir, 'package.json')).version;
    this.dependencyLinks.set(name, { dir, requestedRange });
  }

  linkDevDependency(name: string, opts: { baseDir: string; resolveName?: string } | { target: string }) {
    this.linkDependency(name, opts);
    this.linkIsDevDependency.add(name);
  }

  dependencyProjects() {
    return Object.keys(this._dependencies).map(dependency => this._dependencies[dependency]);
  }

  devDependencyProjects() {
    return Object.keys(this._devDependencies).map(dependency => this._devDependencies[dependency]);
  }

  private pkgJSONWithDeps(): PackageJson {
    let dependencies = this.depsToObject(this.dependencyProjects());
    let devDependencies = this.depsToObject(this.devDependencyProjects());
    for (let [name, { requestedRange }] of this.dependencyLinks.entries()) {
      if (this.linkIsDevDependency.has(name)) {
        devDependencies[name] = requestedRange;
      } else {
        dependencies[name] = requestedRange;
      }
    }
    return Object.assign(this.pkg, {
      dependencies,
      devDependencies,
    });
  }

  clone(): Project {
    let cloned: Project = new (this.constructor as typeof Project)();
    cloned.pkg = JSON.parse(JSON.stringify(this.pkg));
    cloned.files = JSON.parse(JSON.stringify(this.files));
    for (let [name, depProject] of Object.entries(this._dependencies)) {
      cloned._dependencies[name] = depProject.clone();
    }
    for (let [name, depProject] of Object.entries(this._devDependencies)) {
      cloned._devDependencies[name] = depProject.clone();
    }
    cloned.dependencyLinks = new Map(this.dependencyLinks);
    cloned.linkIsDevDependency = new Set(this.linkIsDevDependency);
    cloned.requestedRange = this.requestedRange;
    return cloned;
  }

  dispose() {
    if (this._tmp) {
      this._tmp.removeCallback();
    }
  }

  private depsToObject(deps: Project[]) {
    let obj: { [name: string]: string } = {};
    deps.forEach(dep => (obj[dep.name] = dep.requestedRange));
    return obj;
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

function unwrapPackageName(obj: any, packageName: string): fixturify.DirJSON {
  let scoped = parseScoped(packageName);
  if (scoped) {
    return getFolder(getFolder(obj, scoped.scope), scoped.name);
  }
  return getFolder(obj, packageName);
}
