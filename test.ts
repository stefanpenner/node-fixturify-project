import chai = require('chai');
import Project = require('./index');
import fs = require('fs-extra');
import path = require('path');
import { DirJSON } from 'fixturify';

const expect = chai.expect;

describe('Project', function () {
  function readJSON(file: string) {
    return JSON.parse(fs.readFileSync(file, 'UTF8'));
  }

  function read(file: string) {
    return fs.readFileSync(file, 'UTF8');
  }

  function readDir(path: string) {
    return fs.readdirSync(path);
  }

  it('has the basic', function () {
    let project = new Project('rsvp', '3.1.4');
    project.files['index.js'] = `module.exports = "Hello, World!";`;
    let rsvp = project
      .addDependency('ember-cli', '3.1.1', cli => cli.addDependency('console-ui', '3.3.3'))
      .addDependency('rsvp', '3.1.4');
    let source = project.addDevDependency('ember-source', '3.1.1');
    project.addDevDependency('@ember/ordered-set', '3.1.1');
    project.writeSync();

    let index = read(`${project.root}/rsvp/index.js`);
    let nodeModules = readDir(`${project.root}/rsvp/node_modules`);

    expect(rsvp.root).to.eql(path.normalize(`${project.root}/rsvp/node_modules/ember-cli/node_modules`));
    expect(source.root).to.eql(path.normalize(`${project.root}/rsvp/node_modules`));
    expect(rsvp.baseDir).to.eql(path.normalize(`${project.root}/rsvp/node_modules/ember-cli/node_modules/rsvp`));
    expect(source.baseDir).to.eql(path.normalize(`${project.root}/rsvp/node_modules/ember-source`));

    expect(read(`${project.root}/rsvp/index.js`)).to.eql(`module.exports = "Hello, World!";`);

    expect(readJSON(`${project.root}/rsvp/package.json`)).to.eql({
      name: 'rsvp',
      version: '3.1.4',
      keywords: [],
      dependencies: {
        'ember-cli': '3.1.1',
      },
      devDependencies: {
        '@ember/ordered-set': '3.1.1',
        'ember-source': '3.1.1',
      },
    });

    expect(read(`${project.root}/rsvp/node_modules/ember-source/index.js`)).to.contain(`module.exports`);
    expect(require(`${project.root}/rsvp/node_modules/ember-source/index.js`)).to.eql({});

    expect(readJSON(`${project.root}/rsvp/node_modules/ember-source/package.json`)).to.eql({
      name: 'ember-source',
      version: '3.1.1',
      keywords: [],
      dependencies: {},
      devDependencies: {},
    });

    expect(readJSON(`${project.root}/rsvp/node_modules/ember-cli/package.json`)).to.eql({
      name: 'ember-cli',
      version: '3.1.1',
      keywords: [],
      dependencies: {
        'console-ui': '3.3.3',
        rsvp: '3.1.4',
      },
      devDependencies: {},
    });

    expect(read(`${project.root}/rsvp/node_modules/ember-cli/node_modules/console-ui/index.js`)).to.contain(
      `module.exports`
    );
    expect(require(`${project.root}/rsvp/node_modules/ember-cli/node_modules/console-ui/index.js`)).to.eql({});

    expect(read(`${project.root}/rsvp/node_modules/@ember/ordered-set/index.js`)).to.contain(`module.exports`);
    expect(require(`${project.root}/rsvp/node_modules/@ember/ordered-set/index.js`)).to.eql({});

    expect(readJSON(`${project.root}/rsvp/node_modules/ember-cli/node_modules/console-ui/package.json`)).to.eql({
      name: 'console-ui',
      version: '3.3.3',
      keywords: [],
      dependencies: {},
      devDependencies: {},
    });

    expect(nodeModules.sort()).to.eql(['@ember', 'ember-cli', 'ember-source']);

    expect(index).to.eql('module.exports = "Hello, World!";');
  });

  it('supports default version', function () {
    const input = new Project('foo');
    expect(input.version).to.eql('0.0.0');
    expect(JSON.parse(input.toJSON('package.json') as string)).to.have.property('version', '0.0.0');
  });

  it('supports removing packages', function () {
    const input = new Project('foo', '3.1.2');

    input.addDependency('rsvp', '4.4.4', rsvp => rsvp.addDependency('mkdirp', '4.4.4'));
    input.addDevDependency('omg', '4.4.4', omg => omg.addDependency('fs-extra', '5.5.5.'));

    expect(input.dependencies().map(dep => dep.name)).to.eql(['rsvp']);
    expect(input.devDependencies().map(dep => dep.name)).to.eql(['omg']);

    input.removeDependency('rsvp');
    input.removeDevDependency('omg');

    expect(input.dependencies().map(dep => dep.name)).to.eql([]);
    expect(input.devDependencies().map(dep => dep.name)).to.eql([]);
  });

  it('requires name and version', function () {
    let P = Project as any;
    expect(() => new P('rsvp', null)).to.throw(/rsvp's package.json is missing a version/);
    expect(() => new P(null, null)).to.throw(/missing a name/);
  });

  it('it supports construction of a project via JSON', function () {
    const input = new Project('foo', '3.1.2');

    input.addDependency('rsvp', '4.4.4', rsvp => rsvp.addDependency('mkdirp', '4.4.4'));
    input.addDevDependency('omg', '4.4.4', omg => omg.addDependency('fs-extra', '5.5.5.'));

    input.files = {
      'index.js': 'OMG',
      foo: {
        bar: {
          baz: 'quz',
        },
      },
    };

    const json = input.toJSON();
    const project = Project.fromJSON(json, 'foo');

    expect(project.toJSON()).to.eql(json);
  });

  it('it supports construction of a project via JSON but without package.json#devDependencies or package.json#dependencies', function () {
    const input = new Project('foo', '3.1.2');

    input.files = {
      'index.js': 'OMG',
      foo: {
        bar: {
          baz: 'quz',
        },
      },
      'package.json': '{"name": "foo"}',
    };

    const json = input.toJSON();
    const project = Project.fromJSON(json, 'foo');

    expect(project.toJSON()).to.eql(json);
  });

  it('it supports deep cloning', function () {
    const input = new Project('foo', '3.1.2');

    input.addDependency('rsvp', '4.4.4', rsvp => rsvp.addDependency('mkdirp', '4.4.4'));
    input.addDevDependency('omg', '4.4.4', omg => omg.addDependency('fs-extra', '5.5.5.'));

    input.files = {
      'index.js': 'OMG',
      foo: {
        bar: {
          baz: 'quz',
        },
      },
    };

    const output = input.clone();

    expect(output.toJSON()).to.eql(input.toJSON());
    input.name = 'bar';

    expect(output.name).to.eql('foo');
    expect(input.name).to.eql('bar');

    input.addDependency('-no-such-package-', '22');
    expect(input.dependencies().map(x => x.name)).to.contain('-no-such-package-');
    expect(output.dependencies().map(x => x.name)).to.not.contain('-no-such-package-');
  });

  it('supports readSync', function () {
    const input = new Project('foo', '3.1.2');
    const output = new Project('foo', '0.0.0');

    input.addDependency('rsvp', '4.4.4', rsvp => rsvp.addDependency('mkdirp', '4.4.4'));
    input.addDevDependency('omg', '4.4.4', omg => omg.addDependency('fs-extra', '5.5.5.'));

    input.files = {
      'index.js': 'OMG',
      foo: {
        bar: {
          baz: 'quz',
        },
      },
    };

    input.writeSync();
    output.readSync(input.root);

    expect(output.toJSON()).to.eql(input.toJSON());
  });

  it('supports static readSync', function () {
    const input = new Project('foo', '3.1.2');

    input.addDependency('rsvp', '4.4.4', rsvp => rsvp.addDependency('mkdirp', '4.4.4'));
    input.addDevDependency('omg', '4.4.4', omg => omg.addDependency('fs-extra', '5.5.5.'));

    input.files = {
      'index.js': 'OMG',
      foo: {
        bar: {
          baz: 'quz',
        },
      },
    };

    input.writeSync();

    const output = Project.fromDir(input.root, 'foo');

    expect(output.toJSON()).to.eql(input.toJSON());
  });

  it('supports inferring package#name if Project.fromDir is invoked without a second argument', function () {
    const input = new Project('foo', '3.1.2');

    input.addDependency('rsvp', '4.4.4', rsvp => rsvp.addDependency('mkdirp', '4.4.4'));
    input.addDevDependency('omg', '4.4.4', omg => omg.addDependency('fs-extra', '5.5.5.'));

    input.files = {
      'index.js': 'OMG',
      foo: {
        bar: {
          baz: 'quz',
        },
      },
    };

    input.writeSync();

    const output = Project.fromDir(input.root + '/foo');

    expect(output.name).to.eql('foo');
    expect(output.version).to.eql('3.1.2');
    expect(output.toJSON()).to.eql(input.toJSON());
    expect(() => {
      Project.fromDir(input.root + '/foo', undefined);
    }).to.throw(`fromDir's second optional argument, when provided, must not be undefined.`);
  });

  it('supports custom PKG properties', function () {
    let project = new Project('foo', '123');
    project.pkg['ember-addon'] = {
      name: 'foo',
    };

    project.writeSync();
    expect(readJSON(`${project.root}/foo/package.json`)).to.eql({
      dependencies: {},
      devDependencies: {},
      'ember-addon': {
        name: 'foo',
      },
      keywords: [],
      name: 'foo',
      version: '123',
    });

    project.pkg.name = 'apple';
    project.pkg.version = '123';

    expect(project.name, 'apple');
    expect(project.version, '123');

    project.name = 'pink';
    project.version = '1';

    expect(project.name, 'pink');
    expect(project.version, '1');

    expect(project.pkg.name, 'pink');
    expect(project.pkg.version, '1');
  });

  it('to JSON with 1 arg, is an alias for toJSON()[project.name][arg]', function () {
    let project = new Project('foo', '123');
    project.addDependency('rsvp', '1.2.3');
    project.addDevDependency('q', '1.2.4');

    expect(JSON.parse(project.toJSON('package.json') as string)).to.deep.equal({
      name: 'foo',
      version: '123',
      keywords: [],
      dependencies: {
        rsvp: '1.2.3',
      },
      devDependencies: {
        q: '1.2.4',
      },
    });
  });

  it('handles scoped deps', function () {
    let project = new Project('foo', '123');
    project.addDependency('@test/foo', '1.0.0');
    project.addDependency('@test/bar', '1.0.0');
    project.writeSync();
    let foo = project.toJSON().foo as DirJSON;
    let node_modules = foo && (foo.node_modules as DirJSON);
    let scope = node_modules && (node_modules['@test'] as DirJSON);
    expect(Object.keys(scope)).to.deep.equal(['foo', 'bar']);
  });

  it('handles scoped devDeps', function () {
    let project = new Project('foo', '123');
    project.addDevDependency('@test/foo', '1.0.0');
    project.addDevDependency('@test/bar', '1.0.0');
    project.writeSync();
    let foo = project.toJSON().foo as DirJSON;
    let node_modules = foo && (foo.node_modules as DirJSON);
    let scope = node_modules && (node_modules['@test'] as DirJSON);
    expect(Object.keys(scope)).to.deep.equal(['foo', 'bar']);
  });

  it('has a working dispose to allow early cleanup', function () {
    let project = new Project('foo', '123');
    project.addDependency('rsvp', '1.2.3');
    project.addDevDependency('q', '1.2.4');
    project.writeSync();
    expect(fs.readdirSync(project.root)).to.eql(['foo']);
    project.dispose();
    expect(fs.existsSync(project.root)).to.eql(false);
  });

  it('supports namespaced packages', function () {
    let project = new Project('@ember/foo');
    expect(project.name, '@ember/foo');
    project.writeSync();
    expect(fs.readdirSync(project.root)).to.eql(['@ember']);
    expect(fs.readdirSync(path.join(project.root, '@ember'))).to.eql(['foo']);
  });

  it('supports linking to existing dependency via baseDir', function () {
    let baseProject = new Project('base');
    baseProject.addDependency('moment');
    baseProject.writeSync();

    let project = new Project('my-app');
    project.linkDependency('moment', { baseDir: baseProject.baseDir });
    project.writeSync();
    expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(
      path.join(baseProject.baseDir, 'node_modules', 'moment')
    );
  });

  it('supports linking to existing dependency via baseDir and resolveName', function () {
    let baseProject = new Project('base');
    baseProject.addDependency('moment-x');
    baseProject.writeSync();

    let project = new Project('my-app');
    project.linkDependency('moment', { baseDir: baseProject.baseDir, resolveName: 'moment-x' });
    project.writeSync();
    expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(
      path.join(baseProject.baseDir, 'node_modules', 'moment-x')
    );
  });

  it('supports linking to existing dependency via target', function () {
    let baseProject = new Project('base');
    baseProject.writeSync();

    let project = new Project('my-app');
    project.linkDependency('moment', { target: baseProject.baseDir });
    project.writeSync();
    expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(baseProject.baseDir);
  });

  it('supports linking to existing dependency from within nested project', function () {
    let baseProject = new Project('base');
    baseProject.addDependency('moment');
    baseProject.writeSync();
    let project = new Project('my-app');
    let inner = project.addDependency('inner');
    inner.linkDependency('moment', { baseDir: baseProject.baseDir });
    project.writeSync();
    expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'inner', 'node_modules', 'moment'))).to.eql(
      path.join(baseProject.baseDir, 'node_modules', 'moment')
    );
  });

  it('adds linked dependencies to package.json', function () {
    let baseProject = new Project('base');
    baseProject.addDependency('moment', '1.2.3');
    baseProject.writeSync();

    let project = new Project('my-app');
    project.linkDependency('moment', { baseDir: baseProject.baseDir });
    project.writeSync();
    expect(fs.readJSONSync(path.join(project.baseDir, 'package.json')).dependencies.moment).to.eql('1.2.3');
  });

  it('adds linked devDependencies to package.json', function () {
    let baseProject = new Project('base');
    baseProject.addDependency('moment', '1.2.3');
    baseProject.writeSync();

    let project = new Project('my-app');
    project.linkDevDependency('moment', { baseDir: baseProject.baseDir });
    project.writeSync();
    expect(fs.readJSONSync(path.join(project.baseDir, 'package.json')).devDependencies.moment).to.eql('1.2.3');
  });

  it('supports linking to existing devDependencies', function () {
    let baseProject = new Project('base');
    baseProject.addDependency('moment', '1.2.3');
    baseProject.writeSync();

    let project = new Project('my-app');
    project.linkDevDependency('moment', { baseDir: baseProject.baseDir });
    project.writeSync();
    expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(
      path.join(baseProject.baseDir, 'node_modules', 'moment')
    );
  });

  it('can read a project with linked dependencies', function () {
    // start with a template addon
    let addonTemplate = new Project('stock-addon');
    addonTemplate.addDependency('helper-lib', '1.2.3');
    addonTemplate.files['hello.js'] = '// it works';
    addonTemplate.writeSync();

    // build a new addon from the template
    let myAddon = Project.fromDir(addonTemplate.baseDir, { linkDeps: true });
    myAddon.name = 'custom-addon';
    myAddon.files['layered-extra.js'] = '// extra stuff';

    // use the new addon in an app
    let myApp = new Project('my-app');
    myApp.addDependency(myAddon);
    myApp.writeSync();

    expect(
      fs.readlinkSync(path.join(myApp.baseDir, 'node_modules', 'custom-addon', 'node_modules', 'helper-lib'))
    ).to.eql(path.join(addonTemplate.baseDir, 'node_modules', 'helper-lib'));
    expect(fs.existsSync(path.join(myApp.baseDir, 'node_modules', 'custom-addon', 'hello.js'))).to.eql(true);
    expect(fs.existsSync(path.join(myApp.baseDir, 'node_modules', 'custom-addon', 'layered-extra.js'))).to.eql(true);
  });

  it('can override a linked dependency with a new Project dependency', function () {
    let baseProject = new Project('base');
    baseProject.addDependency('moment', '1.2.3');
    baseProject.writeSync();

    let project = Project.fromDir(baseProject.baseDir, { linkDeps: true });
    project.addDependency('moment', '4.5.6');
    project.writeSync();
    expect(fs.lstatSync(path.join(project.baseDir, 'node_modules', 'moment')).isSymbolicLink()).to.eql(false);
    expect(fs.readJSONSync(path.join(project.baseDir, 'node_modules', 'moment', 'package.json')).version).to.eql(
      '4.5.6'
    );
  });

  it('can override a Project dependency with a linked dependency', function () {
    let dep = new Project('dep', '1.2.3');
    dep.files['first.js'] = '';
    dep.writeSync();

    let project = new Project('app');
    let dep2 = project.addDependency('dep', '4.5.6');
    dep2.files['second.js'] = '';
    project.linkDependency('dep', { target: dep.baseDir });
    project.writeSync();
    expect(fs.lstatSync(path.join(project.baseDir, 'node_modules', 'dep')).isSymbolicLink(), 'is symlink').is.true;
    expect(
      fs.readJSONSync(path.join(project.baseDir, 'node_modules', 'dep', 'package.json')).version,
      'version'
    ).to.eql('1.2.3');
    expect(fs.existsSync(path.join(project.baseDir, 'node_modules', 'dep', 'first.js')), 'first.js').is.true;
    expect(fs.existsSync(path.join(project.baseDir, 'node_modules', 'dep', 'second.js')), 'second.js').is.false;
  });

  it.skip('preserves linking behaviors through clone', function () {
    let baseProject = new Project('base');
    baseProject.writeSync();

    let project = new Project('my-app');
    project.linkDependency('moment', { target: baseProject.baseDir });
    project.clone().writeSync();
    expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(baseProject.baseDir);
  });
});
