# node-fixturify-project

[![CI](https://github.com/stefanpenner/node-fixturify-project/workflows/CI/badge.svg)](https://github.com/stefanpenner/node-fixturify-project/actions/workflows/ci.yml)

When implementing JS build tooling it is common to have complete projects as
fixture data. Unfortunately fixtures committed to disk can be somewhat to
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
project.baseDir = 'some/root/';

project.writeSync();

// after writeSync(), you can read project.baseDir even if you didn't set it
expect(fs.existsSync(join(project.baseDir, 'index.js'))).to.eql(true);
```

The above example produces the following files (and most importantly the
appropriate file contents:

```sh
some/root/package.json
some/root/index.js
some/root/node_modules/mocha/package.json
some/root/node_modules/chai/package.json
```

### Nesting Dependencies

`addDependency` returns another `Project` instance, so you can nest arbitrarily deep:

```js
const { Project } = require('fixturify-project');

let project = new Project('rsvp');
let a = project.addDependency('a');
let b = a.addDependency('b');
let c = b.addDependency('c');

project.writeSync();
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

project.writeSync();
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
let project = Project.fromDir("./sample-project", { linkDeps: true });
project.files['extra.js'] = '// stuff';
project.write();
```

This will generate a new copy of sample-project, with symlinks to all its
original dependencies, but with "extra.js" added.

