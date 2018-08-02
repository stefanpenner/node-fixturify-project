# node-fixturify-project
[![Build Status](https://travis-ci.org/stefanpenner/node-fixturify-project.svg?branch=master)](https://travis-ci.org/stefanpenner/node-fixturify-project)

A complementary project to [node-fixturify](https://github.com/joliss/node-fixturify)

When implementing JS build tooling it is common to have complete projects as
fixture data. Unfortunately fixtures commited to disk can be somewhat to
maintain and augment.

The node-fixturify library is a great way to co-locate tests and their file
system fixture information. This project embraces node-fixturify, but aims to
reduce the verbosity when building graphs of node modules and dependencies.


## Usage

```sh
yarn add node-fixturify-project
```

```js
const Project = require('fixturify-project');
const project = new Project('rsvp', '3.1.4');

project.addDependency('mocha', '5.2.0');
project.addDependency('chai', '5.2.0');

project.addFile('index.js', 'module.exports = "Hello, World!"');

project.writeSync('some/root/');
```

Which the following files (and most importantly the appropriate file contents:

```sh
some/root/rsvp/package.json
some/root/rsvp/index.js
some/root/rsvp/node_modules/mocha/package.json
some/root/rsvp/node_modules/chai/package.json
```

One can also produce JSON, which can be used directly by node-fixturify:

```js
// continued from above
const fixturify = require('fixturify');

fixturify.writeSync('some/other/root', project.toJSON());
```

### Adanced

Obviously nested dependencies are common, and are not only supported but somewhat ergonomics:

```js
const Project = require('node-fixturify-project');
const project = new Project('rsvp', '3.1.4');

// version 1
project.addDependecy('a', '1.2.3', a => a.addDependency('d', '3.2.1'));

// version 2
let b = project.addDependecy('b', '3.2.3');
let c = b.addDependency('c', '4.4.4');

// and this works recurisively:
let e = c.addDependency('e', '5.4.4');

project.writeSync('some/root/');
```

Which produces:

```sh
some/root/rsvp/package.json
some/root/rsvp/index.js
some/root/rsvp/node_modules/a/package.json
some/root/rsvp/node_modules/a/node_modules/d/package.json
some/root/rsvp/node_modules/b/package.json
some/root/rsvp/node_modules/b/node_modules/c/package.json
some/root/rsvp/node_modules/b/node_modules/c/node_modules/e/package.json
```

