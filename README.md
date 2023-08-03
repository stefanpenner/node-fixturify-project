# node-fixturify-project

[![npm version](https://badge.fury.io/js/fixturify-project.svg)](https://badge.fury.io/js/fixturify-project)
[![CI](https://github.com/stefanpenner/node-fixturify-project/workflows/CI/badge.svg)](https://github.com/stefanpenner/node-fixturify-project/actions/workflows/ci.yml)

When implementing JS build tooling it is common to have complete projects as
fixture data. Unfortunately fixtures committed to disk can be somewhat hard to
maintain and augment.

## Basic Usage

```sh
yarn add fixturify-project
```

```js
const { Project } = require('fixturify-project');
const project = new Project('rsvp', '3.1.4', {
  files: {
    'index.js': 'module.exports = "Hello, World!"',
  },
});

project.addDependency('mocha', '5.2.0');
project.addDependency('chai', '5.2.0');

project.pkg; // => the contents of package.json for the given project
project.files; // => read or write the set of files further

// if you don't set this, a new temp dir will be made for you when you writeSync()
project.baseDir = 'some/base/dir/';

await project.write();

// after writeSync(), you can read project.baseDir even if you didn't set it
expect(fs.existsSync(join(project.baseDir, 'index.js'))).to.eql(true);
```

The above example produces the following files (and most importantly the
appropriate file contents:

```sh
some/base/dir/package.json
some/base/dir/index.js
some/base/dir/node_modules/mocha/package.json
some/base/dir/node_modules/chai/package.json
```

### Nesting Dependencies

`addDependency` returns another `Project` instance, so you can nest arbitrarily deep:

```js
const { Project } = require('fixturify-project');

let project = new Project('rsvp');
let a = project.addDependency('a');
let b = a.addDependency('b');
let c = b.addDependency('c');

await project.write();
```

Which produces:

```sh
$TMPDIR/xxx/package.json
$TMPDIR/xxx/index.js
$TMPDIR/xxx/node_modules/a/package.json
$TMPDIR/xxx/node_modules/a/node_modules/b/package.json
$TMPDIR/xxx/node_modules/b/node_modules/b/node_modules/c/package.json
```

### Linking to real dependencies

Instead of creating all packages from scratch, you can link to real preexisting
packages. This lets you take a real working package and modify it and its
dependencies and watch how it behaves.

```js
const { Project } = require('fixturify-project');

let project = new Project();
let a = project.addDependency('a');

// explicit target
project.linkDependency('b', { target: '/example/b' });

// this will follow node resolution rules to lookup "c" from "../elsewhere"
project.linkDependency('c', { baseDir: '/example' });

// this will follow node resolution rules to lookup "my-aliased-name" from "../elsewhere"
project.linkDependency('d', { baseDir: '/example', resolveName: 'my-aliased-name' });

await project.write();
```

Produces:

```sh
$TMPDIR/xxx/package.json
$TMPDIR/xxx/index.js
$TMPDIR/xxx/node_modules/a/package.json
$TMPDIR/xxx/node_modules/a/node_modules/b -> /example/b
$TMPDIR/xxx/node_modules/b/node_modules/c -> /example/node_modules/c
$TMPDIR/xxx/node_modules/b/node_modules/d -> /example/node_modules/my-aliased-name
```

When constructing a whole Project from a directory, you can choose to link all
dependencies instead of copying them in as Projects:

```js
let project = Project.fromDir('./sample-project', { linkDeps: true });
project.files['extra.js'] = '// stuff';
await project.write();
```

This will generate a new copy of sample-project, with symlinks to all its
original dependencies, but with "extra.js" added.

By default, `linkDeps` will only link up `dependencies` (which is appropriate
for libraries). If you want to also include `devDependencies` (which is
appropriate for apps) you can use `linkDevDeps` instead.

## API

<!--DOCS_START-->
<a name="Project"></a>

## Project
**Kind**: global class

- [node-fixturify-project](#node-fixturify-project)
  - [Basic Usage](#basic-usage)
    - [Nesting Dependencies](#nesting-dependencies)
    - [Linking to real dependencies](#linking-to-real-dependencies)
  - [API](#api)
  - [Project](#project)
    - [project.baseDir](#projectbasedir)
    - [project.baseDir](#projectbasedir-1)
    - [project.name : string](#projectname--string)
    - [project.name](#projectname)
    - [project.version : string](#projectversion--string)
    - [project.version](#projectversion)
    - [project.mergeFiles(dirJSON)](#projectmergefilesdirjson)
    - [project.write(dirJSON?)](#projectwritedirjson)
    - [~~project.writeSync()~~](#projectwritesync)
    - [project.addDependency() ⇒](#projectadddependency-)
    - [project.addDevDependency() ⇒](#projectadddevdependency-)
    - [project.removeDependency(name)](#projectremovedependencyname)
    - [project.removeDevDependency(name)](#projectremovedevdependencyname)
    - [project.linkDependency(name)](#projectlinkdependencyname)
    - [project.linkDevDependency(name)](#projectlinkdevdependencyname)
    - [project.dependencyProjects() ⇒](#projectdependencyprojects-)
    - [project.devDependencyProjects() ⇒](#projectdevdependencyprojects-)
    - [project.clone() ⇒](#projectclone-)
    - [project.dispose()](#projectdispose)
    - [Project.fromDir(baseDir, opts) ⇒](#projectfromdirbasedir-opts-)

### project.baseDir
<p>Sets the base directory of the project.</p>

**Kind**: instance property of [<code>Project</code>](#Project)

| Param | Description |
| --- | --- |
| dir | <p>The directory path.</p> |

<a name="Project+baseDir"></a>

### project.baseDir
<p>Gets the base directory path, usually a tmp directory unless a baseDir has been explicitly set.</p>

**Kind**: instance property of [<code>Project</code>](#Project)
**Read only**: true
<a name="Project+name"></a>

### project.name : <code>string</code>
<p>Gets the package name from the package.json.</p>

**Kind**: instance property of [<code>Project</code>](#Project)
<a name="Project+name"></a>

### project.name
<p>Sets the package name in the package.json.</p>

**Kind**: instance property of [<code>Project</code>](#Project)
<a name="Project+version"></a>

### project.version : <code>string</code>
<p>Gets the version number from the package.json.</p>

**Kind**: instance property of [<code>Project</code>](#Project)
<a name="Project+version"></a>

### project.version
<p>Sets the version number in the package.json.</p>

**Kind**: instance property of [<code>Project</code>](#Project)
<a name="Project+mergeFiles"></a>

### project.mergeFiles(dirJSON)
<p>Merges an object containing a directory represention with the existing files.</p>

**Kind**: instance method of [<code>Project</code>](#Project)

| Param | Description |
| --- | --- |
| dirJSON | <p>An object containing a directory representation to merge.</p> |

<a name="Project+write"></a>

### project.write(dirJSON?)
<p>Writes the existing files property containing a directory representation to the tmp directory.</p>

**Kind**: instance method of [<code>Project</code>](#Project)

| Param | Description |
| --- | --- |
| dirJSON? | <p>An optional object containing a directory representation to write.</p> |

<a name="Project+writeSync"></a>

### ~~project.writeSync()~~
***Deprecated***

**Kind**: instance method of [<code>Project</code>](#Project)
<a name="Project+addDependency"></a>

### project.addDependency() ⇒
<p>Adds a dependency to the Project's package.json.</p>

**Kind**: instance method of [<code>Project</code>](#Project)
**Returns**: <ul>
<li>The Project instance.</li>
</ul>
<a name="Project+addDevDependency"></a>

### project.addDevDependency() ⇒
<p>Adds a devDependency to the Project's package.json.</p>

**Kind**: instance method of [<code>Project</code>](#Project)
**Returns**: <ul>
<li>The Project instance.</li>
</ul>
<a name="Project+removeDependency"></a>

### project.removeDependency(name)
<p>Removes a dependency to the Project's package.json.</p>

**Kind**: instance method of [<code>Project</code>](#Project)

| Param | Description |
| --- | --- |
| name | <p>The name of the dependency to remove.</p> |

<a name="Project+removeDevDependency"></a>

### project.removeDevDependency(name)
<p>Removes a devDependency.</p>

**Kind**: instance method of [<code>Project</code>](#Project)

| Param | Description |
| --- | --- |
| name | <p>The name of the devDependency to remove.</p> |

<a name="Project+linkDependency"></a>

### project.linkDependency(name)
<p>Links a dependency.</p>

**Kind**: instance method of [<code>Project</code>](#Project)

| Param | Description |
| --- | --- |
| name | <p>The name of the dependency to link.</p> |

<a name="Project+linkDevDependency"></a>

### project.linkDevDependency(name)
<p>Links a devDependency.</p>

**Kind**: instance method of [<code>Project</code>](#Project)

| Param | Description |
| --- | --- |
| name | <p>The name of the dependency to link.</p> |

<a name="Project+dependencyProjects"></a>

### project.dependencyProjects() ⇒
**Kind**: instance method of [<code>Project</code>](#Project)
**Returns**: <ul>
<li>An array of the dependencies for this Projct.</li>
</ul>
<a name="Project+devDependencyProjects"></a>

### project.devDependencyProjects() ⇒
**Kind**: instance method of [<code>Project</code>](#Project)
**Returns**: <ul>
<li>An array of the devDependencies for this Projct.</li>
</ul>
<a name="Project+clone"></a>

### project.clone() ⇒
**Kind**: instance method of [<code>Project</code>](#Project)
**Returns**: <ul>
<li>The cloned Project.</li>
</ul>
<a name="Project+dispose"></a>

### project.dispose()
<p>Disposes of the tmp directory that the Project is stored in.</p>

**Kind**: instance method of [<code>Project</code>](#Project)
<a name="Project.fromDir"></a>

### Project.fromDir(baseDir, opts) ⇒
<p>Reads an existing project from the specified base dir.</p>

**Kind**: static method of [<code>Project</code>](#Project)
**Returns**: <ul>
<li>The deserialized Project.</li>
</ul>

| Param | Description |
| --- | --- |
| baseDir | <p>The base directory to read the project from.</p> |
| opts | <p>An options object.</p> |
| opts.linkDeps | <p>Include linking dependencies from the Project's node_modules.</p> |
| opts.linkDevDeps | <p>Include linking devDependencies from the Project's node_modules.</p> |


<!--DOCS_END-->
