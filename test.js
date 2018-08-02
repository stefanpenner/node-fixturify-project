'use strict';

const expect = require('chai').expect;
const Project = require('./index');
const TMPDIR = require('os').tmpdir();
const ROOT = `${TMPDIR}/node-fixturify-project-${Date.now()}`;
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

  it('has the basic', function() {
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

  it('it supports construction of a project via JSON', function() {
    const input = new Project('foo', '3.1.2');

    input.addDependency('rsvp', '4.4.4', rsvp => rsvp.addDependency('mkdirp', '4.4.4'));
    input.addDevDependency('omg', '4.4.4', omg => omg.addDependency('fs-extra', '5.5.5.'));

    input.files = {
      'index.js': 'OMG',
      'foo': {
        'bar': {
          'baz': 'quz'
        }
      }
    };

    const json = input.toJSON();
    const project = Project.fromJSON('foo', json);

    expect(project.toJSON()).to.eql(json);
  });

  it('it supports deep cloning', function() {
    const input = new Project('foo', '3.1.2');

    input.addDependency('rsvp', '4.4.4', rsvp => rsvp.addDependency('mkdirp', '4.4.4'));
    input.addDevDependency('omg', '4.4.4', omg => omg.addDependency('fs-extra', '5.5.5.'));

    input.files = {
      'index.js': 'OMG',
      'foo': {
        'bar': {
          'baz': 'quz'
        }
      }
    };

    const output = input.clone();

    expect(output.toJSON()).to.eql(input.toJSON());
    input.name = 'bar';

    expect(output.name).to.eql('foo');
    expect(input.name).to.eql('bar');

    input.addDependency('asdf', '22');
    expect(input.dependencies().map(x => x.name)).to.contain('asdf');
    expect(output.dependencies().map(x => x.name)).to.not.contain('asdf');
  });
});
