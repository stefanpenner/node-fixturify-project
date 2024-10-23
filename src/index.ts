import fixturify from 'fixturify';
import tmp from 'tmp';
import fs from 'fs-extra';
import path from 'path';
import resolvePackagePath from 'resolve-package-path';
import CacheGroup from 'resolve-package-path/lib/cache-group.js';
import binLinks from 'bin-links';
import { PackageJson as BasePackageJson } from 'type-fest';
import walkSync from 'walk-sync';
import deepmerge from 'deepmerge';
import { findWorkspaceDir } from '@pnpm/find-workspace-dir';
import { findWorkspacePackages } from '@pnpm/workspace.find-packages';
import { packlist } from '@pnpm/fs.packlist';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PackageCache } = require('@embroider/shared-internals');

// we also allow adding arbitrary key/value pairs to a PackageJson
type PackageJson = BasePackageJson & Record<string, any>;
type ProjectCallback = (project: Project) => void;

interface ReadDirOpts {
  linkDeps?: boolean;
  linkDevDeps?: boolean;
}

export interface ProjectArgs {
  name?: string;
  version?: string;
  files?: fixturify.DirJSON;
  requestedRange?: string;
}

tmp.setGracefulCleanup();

const defaultFiles = {
  'index.js': `
    'use strict';
     module.exports = {};`,
};

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
  private dependencyLinks: Map<string, LinkParams> = new Map();
  private linkIsDevDependency: Set<string> = new Set();
  private usingHardLinks = true;
  // we keep our own package resolution cache because the default global one
  // could get polluted by us resolving test-specific things that will change on
  // subsequent tests.
  private resolutionCache = new CacheGroup();

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
  /**
   * @constructor Project
   *
   */
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
      files = deepmerge({}, files);
      delete files['package.json'];
    }

    this.pkg = Object.assign({}, pkg, {
      name: name || pkg.name || 'a-fixturified-project',
      version: version || pkg.version || '0.0.0',
      keywords: pkg.keywords || [],
    });
    if (files) {
      this.files = deepmerge({}, { ...defaultFiles, ...files });
    } else {
      this.files = deepmerge({}, defaultFiles);
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

  /**
   * Sets the base directory of the project.
   *
   * @memberof Project
   * @param dir - The directory path.
   */
  set baseDir(dir: string) {
    if (this._baseDir) {
      throw new Error(`this Project already has a baseDir`);
    }
    this._baseDir = dir;
  }

  /**
   * Gets the base directory path, usually a tmp directory unless a baseDir has been explicitly set.
   *
   * @readonly
   * @memberof Project
   */
  get baseDir() {
    if (!this._baseDir) {
      this._tmp = tmp.dirSync({ unsafeCleanup: true });
      this._baseDir = fs.realpathSync(this._tmp.name);
    }
    return this._baseDir;
  }

  /**
   * Gets the package name from the package.json.
   *
   * @type {string}
   * @memberof Project
   */
  get name(): string {
    return getPackageName(this.pkg);
  }

  /**
   * Sets the package name in the package.json.
   *
   * @memberof Project
   */
  set name(value: string) {
    this.pkg.name = value;
  }

  /**
   * Gets the version number from the package.json.
   *
   * @type {string}
   * @memberof Project
   */
  get version(): string {
    return getPackageVersion(this.pkg);
  }

  /**
   * Sets the version number in the package.json.
   *
   * @memberof Project
   */
  set version(value: string) {
    this.pkg.version = value;
  }

  /**
   * Reads an existing project from the specified base dir.
   *
   * @param baseDir - The base directory to read the project from.
   * @param opts - An options object.
   * @param opts.linkDeps - Include linking dependencies from the Project's node_modules.
   * @param opts.linkDevDeps - Include linking devDependencies from the Project's node_modules.
   * @returns - The deserialized Project.
   */
  static fromDir(baseDir: string, opts?: ReadDirOpts): Project {
    let project = new Project();
    project.readSync(baseDir, opts);
    return project;
  }

  /**
   * Merges an object containing a directory represention with the existing files.
   *
   * @param dirJSON - An object containing a directory representation to merge.
   */
  mergeFiles(dirJSON: fixturify.DirJSON) {
    this.files = deepmerge(this.files, dirJSON);
  }

  /**
   * Writes the existing files property containing a directory representation to the tmp directory.
   *
   * @param dirJSON? - An optional object containing a directory representation to write.
   */
  async write(dirJSON?: fixturify.DirJSON): Promise<void> {
    if (dirJSON) {
      this.mergeFiles(dirJSON);
    }

    await this.writeProject();
    await this.binLinks();
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
  /**
   * Adds a dependency to the Project's package.json.
   *
   * @returns - The Project instance.
   */
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

  /**
   * Adds a devDependency to the Project's package.json.
   *
   * @returns - The Project instance.
   */
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

  /**
   * Removes a dependency to the Project's package.json.
   *
   * @param name - The name of the dependency to remove.
   */
  removeDependency(name: string) {
    delete this._dependencies[name];
    this.dependencyLinks.delete(name);
    this.linkIsDevDependency.delete(name);
  }

  /**
   * Removes a devDependency.
   *
   * @param name - The name of the devDependency to remove.
   */
  removeDevDependency(name: string) {
    delete this._devDependencies[name];
    this.dependencyLinks.delete(name);
    this.linkIsDevDependency.delete(name);
  }

  /**
   * Links a dependency.
   *
   * @param name - The name of the dependency to link.
   */
  linkDependency(name: string, opts: LinkParams): void {
    this.removeDependency(name);
    this.removeDevDependency(name);
    this.dependencyLinks.set(name, opts);
  }

  /**
   * Links a devDependency.
   *
   * @param name - The name of the dependency to link.
   */
  linkDevDependency(name: string, opts: LinkParams) {
    this.linkDependency(name, opts);
    this.linkIsDevDependency.add(name);
  }

  /**
   * @returns - An array of the dependencies for this Projct.
   */
  dependencyProjects() {
    return Object.keys(this._dependencies).map(dependency => this._dependencies[dependency]);
  }

  /**
   * @returns - An array of the devDependencies for this Projct.
   */
  devDependencyProjects() {
    return Object.keys(this._devDependencies).map(dependency => this._devDependencies[dependency]);
  }

  /**
   * @returns - The cloned Project.
   */
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

  /**
   * Disposes of the tmp directory that the Project is stored in.
   */
  dispose() {
    if (this._tmp) {
      this._tmp.removeCallback();
    }
  }

  private async writeProject() {
    // this recurses through all our dependent Projects in three phases

    // first every package gets assigned its base dir
    this.assignBaseDirs();

    let resolvedLinksMap = new Map();

    await this.discoverWorkspaces();

    // then we write out all the files, including their package.jsons. Since the
    // requeste ranges of the dependencies in package.json default to the actual
    // discovered dependencies, this step also resolves dependencies.
    this.writeFiles(resolvedLinksMap);

    // only after all the files are in place for Projects that we are creating
    // do we handle creating symlinks and/or hard links to existing packages and
    // between Projects.
    await this.finalizeWrite(resolvedLinksMap);
  }

  private assignBaseDirs() {
    this.baseDir;
    for (let depList of [this.dependencyProjects(), this.devDependencyProjects()]) {
      for (let dep of depList) {
        dep.baseDir = path.join(this.baseDir, 'node_modules', dep.name);
        dep.assignBaseDirs();
      }
    }
  }

  private writeFiles(resolvedLinksMap: Map<Project, ResolvedLinks>) {
    fixturify.writeSync(this.baseDir, this.files);
    for (let depList of [this.dependencyProjects(), this.devDependencyProjects()]) {
      for (let dep of depList) {
        dep.writeFiles(resolvedLinksMap);
      }
    }
    let resolvedLinks = this.resolveLinks();
    fs.outputJSONSync(path.join(this.baseDir, 'package.json'), this.pkgJSONWithDeps(resolvedLinks), { spaces: 2 });
    resolvedLinksMap.set(this, resolvedLinks);
  }

  private async finalizeWrite(resolvedLinksMap: Map<Project, ResolvedLinks>) {
    for (let [name, { dir: target }] of resolvedLinksMap.get(this)!) {
      await this.writeLinkedPackage(name, target, path.join(this.baseDir, 'node_modules', name));
    }
    for (let depList of [this.dependencyProjects(), this.devDependencyProjects()]) {
      for (let dep of depList) {
        await dep.finalizeWrite(resolvedLinksMap);
      }
    }
  }

  private resolveLinks(): ResolvedLinks {
    return new Map(
      [...this.dependencyLinks.entries()].map(([name, opts]) => {
        let dir: string;
        if ('baseDir' in opts) {
          let pkgJSONPath = resolvePackagePath(opts.resolveName || name, opts.baseDir, this.resolutionCache);
          if (!pkgJSONPath) {
            throw new Error(`failed to locate ${opts.resolveName || name} in ${opts.baseDir}`);
          }
          dir = path.dirname(pkgJSONPath);
        } else if ('target' in opts) {
          dir = opts.target;
        } else {
          dir = opts.project.baseDir;
        }

        let requestedRange: string;
        if (opts.requestedRange) {
          requestedRange = opts.requestedRange;
        } else if ('target' in opts || 'baseDir' in opts) {
          requestedRange = fs.readJsonSync(path.join(dir, 'package.json')).version;
        } else {
          requestedRange = opts.project.version;
        }

        return [name, { requestedRange, dir }];
      })
    );
  }

  private async binLinks() {
    let nodeModules = path.join(this.baseDir, 'node_modules');
    for (const { pkg, path } of readPackages(nodeModules)) {
      await binLinks({ pkg, path, top: false, global: false, force: true });
    }
  }

  private transitivePeersCache = new Map<string, Set<string>>();

  private transitivePeers(dir: string): Set<string> {
    let peers = this.transitivePeersCache.get(dir);
    if (peers) {
      return peers;
    }

    peers = new Set<string>();
    // we prefill the cache before recursing so that we never get trapped in a
    // cycle.
    this.transitivePeersCache.set(dir, peers);

    let pkg = PackageCache.shared('fixturify-project', this.baseDir).get(dir);
    let deps = pkg.dependencies;

    for (let dep of deps) {
      if (pkg.categorizeDependency(dep.name) === 'dependencies') {
        for (let peer of this.transitivePeers(dep.root)) {
          if (pkg.hasDependency(peer)) {
            // we satisfied our dep's peer requirement, either with a
            // non-peer-dep (in which case it's definitely not in our
            // transitivePeers) or with our own peerDep (in which case it will
            // end up handled below when we look at our own peerDeps)
          } else {
            // dep has a peer requirement that we don't satsify, so that makes
            // it part of our own transitivePeers.
            peers.add(peer);
          }
        }
      }
    }

    for (let dep of deps) {
      if (pkg.categorizeDependency(dep.name) === 'peerDependencies') {
        // our own direct peer deps are also part of our transitive peers
        peers.add(dep.name);
      }
    }
    return peers;
  }

  private async writeLinkedPackage(name: string, target: string, destination: string) {
    let targetPkg = fs.readJsonSync(`${target}/package.json`);
    let peers = this.transitivePeers(target);

    if (peers.size === 0) {
      // no peerDeps, so we can just symlink the whole package
      fs.ensureSymlinkSync(target, destination, 'dir');
      return;
    }

    // need to reproduce the package structure in our own location
    await this.hardLinkContents(target, targetPkg, destination);

    // This Set deduplicates things that happen to appear in both dependencies
    // and peerDependencies so that we don't try to link the same dep twice,
    // causing EEXIST failures.
    let depsToLink = new Set<string>();

    for (let section of ['dependencies', 'peerDependencies']) {
      if (targetPkg[section]) {
        for (let depName of Object.keys(targetPkg[section])) {
          if (peers.has(depName)) {
            continue;
          }
          depsToLink.add(depName);
        }
      }
    }

    // collect a list of optional peers
    let optionalPeers = [];
    for (let depName of Object.keys(targetPkg['peerDependenciesMeta'] ?? {})) {
      if (targetPkg['peerDependenciesMeta'][depName]?.optional === true) {
        optionalPeers.push(depName);
      }
    }

    for (let depName of depsToLink) {
      let depTarget = resolvePackagePath(depName, target, this.resolutionCache);

      if (!depTarget && optionalPeers.includes(depName)) {
        // don't link or error about missing optional peer deps
        continue;
      }

      if (!depTarget) {
        throw new Error(
          `[FixturifyProject] package ${name} in ${target} depends on ${depName} but we could not resolve it`
        );
      }
      await this.writeLinkedPackage(depName, path.dirname(depTarget), path.join(destination, 'node_modules', depName));
    }
  }

  private knownWorkspaces: Map<string, boolean> = new Map();

  private async discoverWorkspaces(): Promise<void> {
    for (let opts of this.dependencyLinks.values()) {
      if (!('baseDir' in opts)) {
        continue;
      }
      let dir = opts.baseDir;
      if (this.knownWorkspaces.has(dir)) {
        continue;
      }
      let top = await findWorkspaceDir(dir);
      if (top) {
        let packages = await findWorkspacePackages(top);
        for (let { dir } of packages) {
          this.knownWorkspaces.set(dir, true);
        }
        if (!this.knownWorkspaces.has(dir)) {
          // the dir is not itself one of the workspace packages but was nested
          // within the monorepo. We don't need to recheck it, so make sure it
          // goes into the map.
          this.knownWorkspaces.set(dir, false);
        }
      } else {
        this.knownWorkspaces.set(dir, false);
      }
    }
  }

  private async publishedPackageContents(packageDir: string, pkgJSON: any): Promise<string[]> {
    if (this.knownWorkspaces.get(packageDir)) {
      // when we know that a package is under development, we determine its
      // files the same way "pnpm pack" would.
      return await packlist(packageDir, { packageJsonCache: { packageDir: pkgJSON } });
    }
    // when it's not under development (it was installed by the package
    // manager), we can't really use "pnpm pack", because the inputs to that
    // process include files that are not necessarily themselves packed. But we
    // also don't need to, because what we see on disk is necessarily the
    // published contents already.
    return walkSync(packageDir, { directories: false, ignore: ['node_modules'] });
  }

  private async hardLinkContents(source: string, pkgJSON: any, destination: string) {
    fs.ensureDirSync(destination);
    for (let relativePath of await this.publishedPackageContents(source, pkgJSON)) {
      fs.ensureDirSync(path.dirname(path.join(destination, relativePath)));
      this.hardLinkFile(path.join(source, relativePath), path.join(destination, relativePath));
    }
  }

  private hardLinkFile(source: string, destination: string) {
    if (this.usingHardLinks) {
      try {
        fs.linkSync(source, destination);
        return;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          debugger;
        }
        if (err.code === 'EXDEV') {
          this.usingHardLinks = false;
        }
      }
    }
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL);
  }

  private readSync(baseDir: string, opts?: ReadDirOpts): void {
    const files = fixturify.readSync(baseDir, {
      // when linking deps, we don't need to crawl all of node_modules
      ignore: opts?.linkDeps || opts?.linkDevDeps ? ['node_modules'] : [],
    });

    this.pkg = deserializePackageJson(getFile(files, 'package.json'));
    this.requestedRange = this.version;
    delete files['package.json'];
    this.files = files;

    if (opts?.linkDeps || opts?.linkDevDeps) {
      if (this.pkg.dependencies) {
        for (let dep of Object.keys(this.pkg.dependencies)) {
          this.linkDependency(dep, { baseDir });
        }
      }
      if (this.pkg.devDependencies && opts.linkDevDeps) {
        for (let dep of Object.keys(this.pkg.devDependencies)) {
          this.linkDevDependency(dep, { baseDir });
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

  private pkgJSONWithDeps(resolvedLinks: Map<string, { requestedRange: string; dir: string }>): PackageJson {
    let dependencies = this.depsToObject(this.dependencyProjects());
    let devDependencies = this.depsToObject(this.devDependencyProjects());
    for (let [name, { requestedRange }] of resolvedLinks) {
      if (requestedRange === undefined) {
        throw new Error(
          `No version found for package ${name}. All dependencies must have both a name and version in their package.json.`
        );
      }
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

  private depsToObject(deps: Project[]) {
    let obj: { [name: string]: string } = {};
    deps.forEach(dep => (obj[dep.name] = dep.requestedRange));
    return obj;
  }
}

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

function getFile<Dir extends fixturify.DirJSON, FileName extends keyof Dir>(dir: Dir, fileName: FileName): string {
  const value = dir[fileName];
  if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'object' && value !== null) {
    throw new TypeError(`Expected a file for name '${String(fileName)}' but got a 'Folder'`);
  } else {
    throw new TypeError(`Expected a file for name '${String(fileName)}' but got '${typeof value}'`);
  }
}

function getFolder<Dir extends fixturify.DirJSON, FileName extends keyof Dir>(
  dir: Dir,
  fileName: FileName
): fixturify.DirJSON {
  const value = dir[fileName];

  if (isDirJSON(value)) {
    return value;
  } else if (typeof value === 'string') {
    throw new TypeError(`Expected a file for name '${String(fileName)}' but got 'File'`);
  } else {
    throw new TypeError(`Expected a folder for name '${String(fileName)}' but got '${typeof value}'`);
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

function isObject(e: unknown): e is Object {
  return e !== null && typeof e === 'object' && !Array.isArray(e);
}

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return isObject(e) && 'code' in e;
}

function readString(name: string): string | undefined {
  try {
    return fs.readFileSync(name, 'utf8');
  } catch (e) {
    if (isErrnoException(e)) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') {
        return;
      }
    }
    throw e;
  }
}

function readdir(name: string): string[] {
  try {
    return fs.readdirSync(name);
  } catch (e) {
    if (isErrnoException(e)) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
        return [];
      }
    }
    throw e;
  }
}

function readPackage(dir: string | undefined): { pkg: PackageJson; path: string } | undefined {
  if (dir) {
    const fileName = path.join(dir, 'package.json');
    const content = readString(fileName);
    if (content) {
      return { pkg: deserializePackageJson(content), path: dir };
    }
  }
  return;
}

function readPackages(modulesPath: string): { pkg: PackageJson; path: string }[] {
  const pkgs: { pkg: PackageJson; path: string }[] = [];
  for (const name of readdir(modulesPath)) {
    if (name.startsWith('@')) {
      const scopePath = path.join(modulesPath, name);
      for (const name of readdir(scopePath)) {
        const pkg = readPackage(path.join(scopePath, name));
        if (pkg) pkgs.push(pkg);
      }
    } else {
      const pkg = readPackage(path.join(modulesPath, name));
      if (pkg) pkgs.push(pkg);
    }
  }
  return pkgs;
}

export type LinkParams =
  | { baseDir: string; resolveName?: string; requestedRange?: string }
  | { target: string; requestedRange?: string }
  | { project: Project; requestedRange?: string };

type ResolvedLinks = Map<string, { dir: string; requestedRange: string }>;
