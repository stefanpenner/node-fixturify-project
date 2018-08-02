'use strict';

const expect = require('chai').expect;
const Project = require('./index');
const TMPDIR = require('os').tmpdir;
const ROOT = `${TMPDIR}/node-fixturify-project/`;
const fs = require('fs-extra');

describe('Project', function() {
  beforeEach(function() {
    fs.mkdirpSync(ROOT);
  });

  afterEach(function() {
    fs.removeSync(ROOT);
  });

  function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, 'UTF8'));
  }

  it('basic', function() {
    let project = new Project('rsvp', '3.1.4');

    project.addFile('index.js', `module.exports = "Hello, World!";`);
    project.addDependency('ember-cli', '3.1.1', cli => cli.addDependency('console-ui', '3.3.3')).addDependency('rsvp', '3.1.4');
    project.addDevDependency('ember-source', '3.1.1');
    project.writeSync(ROOT);

    let index = fs.readFileSync(`${ROOT}/rsvp/index.js`, 'UTF8');
    let nodeModules = fs.readdirSync(`${ROOT}/rsvp/node_modules`);

    expect(readJSON(`${ROOT}/rsvp/package.json`, 'UTF8')).to.eql({
      name: 'rsvp',
      version: '3.1.4',
      keywords: [],
      dependencies: {
        'ember-cli': '3.1.1',
      },
      devDependencies: {
        'ember-source': '3.1.1'
      },
    });

    expect(readJSON(`${ROOT}/rsvp/node_modules/ember-source/package.json`, 'UTF8')).to.eql({
      name: 'ember-source',
      version: '3.1.1',
      keywords: [],
      dependencies: { },
      devDependencies: { },
    });

    expect(readJSON(`${ROOT}/rsvp/node_modules/ember-cli/package.json`, 'UTF8')).to.eql({
      name: 'ember-cli',
      version: '3.1.1',
      keywords: [],
      dependencies: {
        'console-ui': '3.3.3',
        'rsvp': '3.1.4'
      },
      devDependencies: { }
    });

    expect(readJSON(`${ROOT}/rsvp/node_modules/ember-cli/node_modules/console-ui/package.json`, 'UTF8')).to.eql({
      name: 'console-ui',
      version: '3.3.3',
      keywords: [],
      dependencies: { },
      devDependencies: { },
    });


    expect(nodeModules.sort()).to.eql([
      'ember-cli',
      'ember-source'
    ]);

    expect(index).to.eql('module.exports = "Hello, World!";');
  });

  it('requires name and version', function() {
    expect(() => new Project('rsvp', null)).to.throw(/rsvp is missing a version/);
    expect(() => new Project(null, null)).to.throw(/Missing name/);
  });
});
