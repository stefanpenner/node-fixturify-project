import fs from 'fs-extra';
import path from 'path';
import { readSync } from 'fixturify';
import { describe, it, expect } from 'vitest';
import walkSync from 'walk-sync';

for (let version of ['cjs', 'js']) {
  const { Project } = await import(`../dist/index.${version}`);
  describe(`Project ${version}`, async () => {
    function readJSON(file: string) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }

    function read(file: string) {
      return fs.readFileSync(file, 'utf-8');
    }

    function readDir(path: string) {
      return fs.readdirSync(path);
    }

    it('has the basic', async () => {
      let project = new Project({
        name: 'rsvp',
        version: '3.1.4',
        files: {
          'index.js': `module.exports = "Hello, World!";`,
        },
      });

      let emberCLI = project.addDependency('ember-cli', '3.1.1');
      emberCLI.addDependency('console-ui', '3.3.3');
      let rsvp = emberCLI.addDependency('rsvp', '3.1.4');

      let source = project.addDevDependency('ember-source', '3.1.1');
      project.addDevDependency('@ember/ordered-set', '3.1.1');
      await project.write();

      let index = read(`${project.baseDir}/index.js`);
      let nodeModules = readDir(`${project.baseDir}/node_modules`);

      expect(rsvp.baseDir).to.eql(path.normalize(`${project.baseDir}/node_modules/ember-cli/node_modules/rsvp`));
      expect(source.baseDir).to.eql(path.normalize(`${project.baseDir}/node_modules/ember-source`));

      expect(read(`${project.baseDir}/index.js`)).to.eql(`module.exports = "Hello, World!";`);

      expect(readJSON(`${project.baseDir}/package.json`)).to.eql({
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

      expect(read(`${project.baseDir}/node_modules/ember-source/index.js`)).to.contain(`module.exports`);
      expect(require(`${project.baseDir}/node_modules/ember-source/index.js`)).to.eql({});

      expect(readJSON(`${project.baseDir}/node_modules/ember-source/package.json`)).to.eql({
        name: 'ember-source',
        version: '3.1.1',
        keywords: [],
        dependencies: {},
        devDependencies: {},
      });

      expect(readJSON(`${project.baseDir}/node_modules/ember-cli/package.json`)).to.eql({
        name: 'ember-cli',
        version: '3.1.1',
        keywords: [],
        dependencies: {
          'console-ui': '3.3.3',
          rsvp: '3.1.4',
        },
        devDependencies: {},
      });

      expect(read(`${project.baseDir}/node_modules/ember-cli/node_modules/console-ui/index.js`)).to.contain(
        `module.exports`
      );
      expect(require(`${project.baseDir}/node_modules/ember-cli/node_modules/console-ui/index.js`)).to.eql({});

      expect(read(`${project.baseDir}/node_modules/@ember/ordered-set/index.js`)).to.contain(`module.exports`);
      expect(require(`${project.baseDir}/node_modules/@ember/ordered-set/index.js`)).to.eql({});

      expect(readJSON(`${project.baseDir}/node_modules/ember-cli/node_modules/console-ui/package.json`)).to.eql({
        name: 'console-ui',
        version: '3.3.3',
        keywords: [],
        dependencies: {},
        devDependencies: {},
      });

      expect(nodeModules.sort()).to.eql(['@ember', 'ember-cli', 'ember-source']);

      expect(index).to.eql('module.exports = "Hello, World!";');
    });

    it('can write a DirJSON', async function () {
      let project = new Project({
        name: 'rsvp',
        version: '3.1.4',
      });

      await project.write({
        top: {
          middle: {
            bottom: {
              'foo.js': 'console.log("bar");',
            },
          },
        },
      });

      expect(walkSync(project.baseDir)).to.eql([
        'index.js',
        'package.json',
        'top/',
        'top/middle/',
        'top/middle/bottom/',
        'top/middle/bottom/foo.js',
      ]);
    });

    it('can merge files in the correct order', async function () {
      let project = new Project({
        name: 'rsvp',
        version: '3.1.4',
        files: {
          'foo.js': 'console.log("bar");',
        },
      });

      expect(project.files).to.eql({
        'foo.js': 'console.log("bar");',
        'index.js': `
    'use strict';
     module.exports = {};`,
      });

      project.mergeFiles({
        'bar.js': 'console.log("baz");',
      });

      expect(project.files).to.eql({
        'foo.js': 'console.log("bar");',
        'bar.js': 'console.log("baz");',
        'index.js': `
    'use strict';
     module.exports = {};`,
      });
    });

    describe('project constructor with callback DSL', function () {
      it('name, version, cb', async () => {
        const projects: { [key: string]: Project } = {};
        const project = new Project('my-project', '0.0.1', project => {
          projects.default = project;
          projects.a = project.addDependency('a', '0.0.2', a => {
            projects.b = a.addDependency('b', '0.0.3');
          });

          projects.c = project.addDevDependency({ name: 'c', version: '0.0.4' }, a => {
            projects.d = a.addDevDependency('d', { version: '0.0.5' }, d => {
              projects.e = d.addDependency('e', { version: '0.0.6' });
            });
          });
        });

        expect(projects.default).to.equal(project);
        expect(projects.a).to.exist;
        expect(projects.b).to.exist;
        expect(projects.c).to.exist;
        expect(projects.d).to.exist;

        expect(project.version).to.eql('0.0.1');
        expect(projects.a.version).to.eql('0.0.2');
        expect(projects.b.version).to.eql('0.0.3');
        expect(projects.c.version).to.eql('0.0.4');
        expect(projects.d.version).to.eql('0.0.5');
        expect(projects.e.version).to.eql('0.0.6');
      });

      it('ProjectArgs, cb', async () => {
        const projects: { [key: string]: Project } = {};
        const project = new Project({ name: 'my-project', version: '0.0.0' }, project => {
          projects.default = project;
        });

        expect(project).to.eql(projects.default);
      });

      it('name, projectArgs - name, cb', async () => {
        const projects: { [key: string]: Project } = {};
        const project = new Project({ name: 'my-project', version: '0.0.0' }, project => {
          projects.default = project;
        });

        expect(project).to.eql(projects.default);
      });

      it('name, version, projectArgs - name - version, cb', async () => {
        const projects: { [key: string]: Project } = {};
        const project = new Project('my-project', '0.0.0', { files: {} }, project => {
          projects.default = project;
        });

        expect(project).to.eql(projects.default);
      });
    });

    describe('.pkg', function () {
      it('flattened usage', async () => {
        const app = new Project('app', '3.1.1');
        const rsvp = app.addDependency('rsvp', '3.2.2');
        const a = rsvp.addDependency('a', '1.1.1');

        expect(app.pkg).to.eql({
          name: 'app',
          version: '3.1.1',
          keywords: [],
        });

        expect(rsvp.pkg).to.eql({
          name: 'rsvp',
          version: '3.2.2',
          keywords: [],
        });

        expect(a.pkg).to.eql({
          name: 'a',
          version: '1.1.1',
          keywords: [],
        });

        await app.write();

        expect(app.pkg).to.eql({
          name: 'app',
          version: '3.1.1',
          keywords: [],
          dependencies: {
            rsvp: '3.2.2',
          },
          devDependencies: {},
        });

        expect(rsvp.pkg).to.eql({
          name: 'rsvp',
          version: '3.2.2',
          keywords: [],
          dependencies: {
            a: '1.1.1',
          },
          devDependencies: {},
        });

        expect(a.pkg).to.eql({
          name: 'a',
          version: '1.1.1',
          keywords: [],
          dependencies: {},
          devDependencies: {},
        });
      });

      it('callback usage', async () => {
        let rsvp!: Project, a!: Project;

        const app = new Project('app', '3.1.1', app => {
          rsvp = app.addDependency('rsvp', '3.2.2', rsvp => {
            a = rsvp.addDependency('a', '1.1.1');
          });
        });

        expect(app.pkg).to.eql({
          name: 'app',
          version: '3.1.1',
          keywords: [],
        });

        expect(rsvp.pkg).to.eql({
          name: 'rsvp',
          version: '3.2.2',
          keywords: [],
        });

        expect(a.pkg).to.eql({
          name: 'a',
          version: '1.1.1',
          keywords: [],
        });

        await app.write();

        expect(app.pkg).to.eql({
          name: 'app',
          version: '3.1.1',
          keywords: [],
          dependencies: {
            rsvp: '3.2.2',
          },
          devDependencies: {},
        });

        expect(rsvp.pkg).to.eql({
          name: 'rsvp',
          version: '3.2.2',
          keywords: [],
          dependencies: {
            a: '1.1.1',
          },
          devDependencies: {},
        });

        expect(a.pkg).to.eql({
          name: 'a',
          version: '1.1.1',
          keywords: [],
          dependencies: {},
          devDependencies: {},
        });
      });
    });

    it('supports default version', async () => {
      const input = new Project();
      expect(input.version).to.eql('0.0.0');
      await input.write();
      expect(fs.readJSONSync(path.join(input.baseDir, 'package.json'))).to.have.property('version', '0.0.0');
    });

    it('supports removing packages', async () => {
      const input = new Project();

      input.addDependency('rsvp').addDependency();
      input.addDevDependency('omg').addDependency();

      expect(input.dependencyProjects().map(dep => dep.name)).to.eql(['rsvp']);
      expect(input.devDependencyProjects().map(dep => dep.name)).to.eql(['omg']);

      input.removeDependency('rsvp');
      input.removeDevDependency('omg');

      expect(input.dependencyProjects().map(dep => dep.name)).to.eql([]);
      expect(input.devDependencyProjects().map(dep => dep.name)).to.eql([]);
    });

    it('it supports deep cloning', async () => {
      const input = new Project('foo', '3.1.2', {
        files: {
          'index.js': 'OMG',
          foo: {
            bar: {
              baz: 'quz',
            },
          },
        },
      });

      input.addDependency('rsvp', '4.4.4').addDependency('mkdirp', '4.4.4');
      input.addDevDependency('omg', '4.4.4').addDependency('fs-extra', '5.5.5.');

      const output = input.clone();

      await output.write();
      await input.write();

      expect(readSync(output.baseDir)).deep.equals(readSync(input.baseDir));

      input.name = 'bar';

      expect(output.name).to.eql('foo');
      expect(input.name).to.eql('bar');

      input.addDependency('-no-such-package-', '22');
      expect(input.dependencyProjects().map(x => x.name)).to.contain('-no-such-package-');
      expect(output.dependencyProjects().map(x => x.name)).to.not.contain('-no-such-package-');
    });

    it('supports fromDir', async () => {
      const input = new Project({
        files: {
          'index.js': 'OMG',
          foo: {
            bar: {
              baz: 'quz',
            },
          },
        },
      });
      input.addDependency('rsvp', '4.4.4').addDependency('mkdirp', '4.4.4');
      input.addDevDependency('omg', '4.4.4').addDependency('fs-extra', '5.5.5.');
      await input.write();

      const output = Project.fromDir(input.baseDir);

      expect(output.files).to.eql(input.files);
      expect(output.dependencyProjects().map(p => p.name)).to.have.members(input.dependencyProjects().map(p => p.name));
    });

    it('supports inferring package#name if Project.fromDir is invoked without a second argument', async () => {
      const input = new Project('foo', '3.1.2', {
        files: {
          'index.js': 'OMG',
          foo: {
            bar: {
              baz: 'quz',
            },
          },
        },
      });
      input.addDependency('rsvp', '4.4.4').addDependency('mkdirp', '4.4.4');
      input.addDevDependency('omg', '4.4.4').addDependency('fs-extra', '5.5.5.');
      await input.write();

      const output = Project.fromDir(input.baseDir);

      expect(output.name).to.eql('foo');
      expect(output.version).to.eql('3.1.2');
      expect(output.files).to.eql(input.files);
      expect(output.pkg).to.eql(input.pkg);
    });

    it('supports custom PKG properties', async () => {
      let project = new Project('foo', '123');
      project.pkg['ember-addon'] = {
        version: 1,
      };

      await project.write();
      expect(readJSON(`${project.baseDir}/package.json`)).to.eql({
        dependencies: {},
        devDependencies: {},
        'ember-addon': {
          version: 1,
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

    it('handles scoped deps', async () => {
      let project = new Project('foo', '123');
      project.addDependency('@test/foo', '1.0.0');
      project.addDependency('@test/bar', '1.0.0');
      await project.write();
      expect(fs.readdirSync(path.join(project.baseDir, 'node_modules', '@test'))).to.have.members(['foo', 'bar']);
    });

    it('handles scoped devDeps', async () => {
      let project = new Project('foo', '123');
      project.addDevDependency('@test/foo', '1.0.0');
      project.addDevDependency('@test/bar', '1.0.0');
      await project.write();
      expect(fs.readdirSync(path.join(project.baseDir, 'node_modules', '@test'))).to.have.members(['foo', 'bar']);
    });

    it('has a working dispose to allow early cleanup', async () => {
      let project = new Project('foo', '123');
      project.addDependency('rsvp', '1.2.3');
      project.addDevDependency('q', '1.2.4');
      await project.write();
      expect(fs.existsSync(project.baseDir)).to.eql(true);
      project.dispose();
      expect(fs.existsSync(project.baseDir)).to.eql(false);
    });

    it('supports linking to existing dependency via baseDir', async () => {
      let baseProject = new Project('base');
      baseProject.addDependency('moment');
      await baseProject.write();

      let project = new Project('my-app');
      project.linkDependency('moment', { baseDir: baseProject.baseDir });
      await project.write();
      expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(
        path.join(baseProject.baseDir, 'node_modules', 'moment')
      );
    });

    it('supports linking to existing dependency via baseDir and resolveName', async () => {
      let baseProject = new Project('base');
      baseProject.addDependency('moment-x');
      await baseProject.write();

      let project = new Project('my-app');
      project.linkDependency('moment', { baseDir: baseProject.baseDir, resolveName: 'moment-x' });
      await project.write();
      expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(
        path.join(baseProject.baseDir, 'node_modules', 'moment-x')
      );
    });

    it('supports linking to existing dependency via target', async () => {
      let baseProject = new Project('base');
      await baseProject.write();

      let project = new Project('my-app');
      project.linkDependency('moment', { target: baseProject.baseDir });
      await project.write();
      expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(baseProject.baseDir);
    });

    it('supports linking between dependencies', async () => {
      let project = new Project('my-app');
      let depA = project.addDependency('dep-a');
      let depB = project.addDependency('dep-b');
      let depC = project.addDependency('dep-c');
      depB.linkDependency('dep-a', { project: depA });
      depB.linkDependency('dep-c', { project: depC });
      await project.write();
      expect(fs.readlinkSync(path.join(depB.baseDir, 'node_modules', 'dep-a'))).to.eql(depA.baseDir);
      expect(fs.readlinkSync(path.join(depB.baseDir, 'node_modules', 'dep-c'))).to.eql(depC.baseDir);
    });

    it('supports linking to existing dependency from within nested project', async () => {
      let baseProject = new Project('base');
      baseProject.addDependency('moment');
      await baseProject.write();
      let project = new Project('my-app');
      let inner = project.addDependency('inner');
      inner.linkDependency('moment', { baseDir: baseProject.baseDir });
      await project.write();
      expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'inner', 'node_modules', 'moment'))).to.eql(
        path.join(baseProject.baseDir, 'node_modules', 'moment')
      );
    });

    it('adjusts peerDependencies of linked dependencies', async () => {
      let baseProject = new Project('base');
      let alpha = baseProject.addDependency('alpha', {
        files: {
          'index.js': `
            exports.betaVersion = function() {
              return require('beta/package.json').version;
            }
            exports.gammaLocation = function() {
              return require.resolve('gamma/package.json');
            }
          `,
          deeper: {
            'index.js': `
              exports.betaVersion = function() {
                return 'inner' + require('beta/package.json').version;
              }
            `,
          },
        },
      });
      alpha.pkg.peerDependencies = { beta: '^1.0.0' };
      alpha.addDependency('gamma');
      baseProject.addDependency('beta', { version: '1.1.0' });
      await baseProject.write();

      // precondition: in the baseProject, alpha sees its beta peerDep as beta@1.1.0
      expect(require(require.resolve('alpha', { paths: [baseProject.baseDir] })).betaVersion()).to.eql('1.1.0');

      let project = new Project('my-app');
      project.linkDependency('alpha', { baseDir: baseProject.baseDir });
      project.addDependency('beta', { version: '1.2.0' });
      await project.write();

      // in our linked project, alpha sees its beta peerDep as beta@1.2.0
      expect(require(require.resolve('alpha', { paths: [project.baseDir] })).betaVersion()).to.eql('1.2.0');

      // deeper modules in our package also work correctly
      expect(require(require.resolve('alpha/deeper', { paths: [project.baseDir] })).betaVersion()).to.eql('inner1.2.0');

      // unrelated dependencies are still shared
      expect(require(require.resolve('alpha', { paths: [project.baseDir] })).gammaLocation()).to.eql(
        require(require.resolve('alpha', { paths: [baseProject.baseDir] })).gammaLocation()
      );
    });

    it('adjusts deeply nested peerDependencies of linked dependencies', async () => {
      let baseProject = new Project('base', {
        files: {
          'index.js': `
            exports.alphasBetaVersion = function() {
              return require('alpha').betaVersion();
            }
            exports.gammasBetaVersion = function() {
              return require('alpha').gammasBetaVersion();
            }
          `,
        },
      });

      // alpha is a direct dependency of base and has a peer dep on beta
      let alpha = baseProject.addDependency('alpha', {
        files: {
          'index.js': `
            exports.betaVersion = function() {
              return require('beta/package.json').version;
            }
            exports.gammasBetaVersion = function() {
              return require('gamma').betaVersion();
            }
          `,
        },
      });
      alpha.pkg.peerDependencies = { beta: '^1.0.0' };

      // gamma is a direct dependency of alpha and shares the peer dep on beta
      let gamma = alpha.addDependency('gamma', {
        files: {
          'index.js': `
            exports.betaVersion = function() {
              return require('beta/package.json').version;
            }
          `,
        },
      });
      gamma.pkg.peerDependencies = { beta: '^1.0.0' };
      baseProject.addDependency('beta', { version: '1.1.0' });
      await baseProject.write();

      // precondition: in the baseProject, alpha and gamma sees their beta peerDep as beta@1.1.0
      let baseModule = require(baseProject.baseDir);
      expect(baseModule.alphasBetaVersion()).to.eql('1.1.0');
      expect(baseModule.gammasBetaVersion()).to.eql('1.1.0');

      let project = new Project('my-app', {
        files: {
          'index.js': `
            exports.alphasBetaVersion = function() {
              return require('alpha').betaVersion();
            }
            exports.gammasBetaVersion = function() {
              return require('alpha').gammasBetaVersion();
            }
        `,
        },
      });
      project.linkDependency('alpha', { baseDir: baseProject.baseDir });
      project.addDependency('beta', { version: '1.2.0' });
      await project.write();

      let myAppModule = require(project.baseDir);
      expect(myAppModule.alphasBetaVersion()).to.eql('1.2.0');
      expect(myAppModule.gammasBetaVersion()).to.eql('1.2.0');
    });

    it('adds linked dependencies to package.json', async () => {
      let baseProject = new Project('base');
      baseProject.addDependency('moment', '1.2.3');
      await baseProject.write();

      let project = new Project('my-app');
      project.linkDependency('moment', { baseDir: baseProject.baseDir });
      await project.write();
      expect(fs.readJSONSync(path.join(project.baseDir, 'package.json')).dependencies.moment).to.eql('1.2.3');
    });

    it('adds linked devDependencies to package.json', async () => {
      let baseProject = new Project('base');
      baseProject.addDependency('moment', '1.2.3');
      await baseProject.write();

      let project = new Project('my-app');
      project.linkDevDependency('moment', { baseDir: baseProject.baseDir });
      await project.write();
      expect(fs.readJSONSync(path.join(project.baseDir, 'package.json')).devDependencies.moment).to.eql('1.2.3');
    });

    it('supports linking to existing devDependencies', async () => {
      let baseProject = new Project('base');
      baseProject.addDependency('moment', '1.2.3');
      await baseProject.write();

      let project = new Project('my-app');
      project.linkDevDependency('moment', { baseDir: baseProject.baseDir });
      await project.write();
      expect(fs.readlinkSync(path.join(project.baseDir, 'node_modules', 'moment'))).to.eql(
        path.join(baseProject.baseDir, 'node_modules', 'moment')
      );
    });

    it('can read a project with linked dependencies', async () => {
      // start with a template addon
      let addonTemplate = new Project('stock-addon');
      addonTemplate.addDependency('helper-lib', '1.2.3');
      addonTemplate.addDevDependency('test-lib');
      addonTemplate.files['hello.js'] = '// it works';
      await addonTemplate.write();

      // build a new addon from the template
      let myAddon = Project.fromDir(addonTemplate.baseDir, { linkDeps: true });
      myAddon.name = 'custom-addon';
      myAddon.files['layered-extra.js'] = '// extra stuff';

      // use the new addon in an app
      let myApp = new Project('my-app');
      myApp.addDependency(myAddon);
      await myApp.write();

      expect(
        fs.readlinkSync(path.join(myApp.baseDir, 'node_modules', 'custom-addon', 'node_modules', 'helper-lib'))
      ).to.eql(path.join(addonTemplate.baseDir, 'node_modules', 'helper-lib'));

      // dev dependencies not included by default
      expect(
        fs.existsSync(path.join(myApp.baseDir, 'node_modules', 'custom-addon', 'node_modules', 'test-lib'))
      ).to.eql(false);

      expect(fs.existsSync(path.join(myApp.baseDir, 'node_modules', 'custom-addon', 'hello.js'))).to.eql(true);
      expect(fs.existsSync(path.join(myApp.baseDir, 'node_modules', 'custom-addon', 'layered-extra.js'))).to.eql(true);
    });

    it('throws an error for linked deps when version is missing', async () => {
      let template = new Project('template');
      template.addDependency('local-lib', './local-lib');
      template.mergeFiles({
        'local-lib': {
          'package.json': JSON.stringify({
            name: 'local-lib',
            main: 'index.js',
          }),
          'index.js': 'console.log("hello world");',
        },
      });

      await template.write();

      let localLibPkgPath = path.join(template.baseDir, 'node_modules', 'local-lib', 'package.json');

      let localLibPkgJson = await fs.readJSON(localLibPkgPath);
      // we have to manually remove the version from the package.json bc fixturify automatically adds it
      // when calling `addDependency`
      delete localLibPkgJson.version;
      await fs.writeJSON(localLibPkgPath, localLibPkgJson);

      let app = Project.fromDir(template.baseDir, { linkDeps: true });
      await expect(app.write()).rejects.toThrowError(
        'No version found for package local-lib. All dependencies must have both a name and version in their package.json.'
      );

      template.dispose();
      app.dispose();
    });

    it('can read a project with linked dev dependencies', async () => {
      // start with a template app
      let appTemplate = new Project('stock-app');
      appTemplate.addDependency('helper-lib', '1.2.3');
      appTemplate.addDevDependency('test-lib');
      appTemplate.files['hello.js'] = '// it works';
      await appTemplate.write();

      // build a new addon from the template
      let myApp = Project.fromDir(appTemplate.baseDir, { linkDevDeps: true });
      myApp.name = 'custom-addon';
      myApp.files['layered-extra.js'] = '// extra stuff';
      await myApp.write();

      expect(fs.readlinkSync(path.join(myApp.baseDir, 'node_modules', 'helper-lib'))).to.eql(
        path.join(appTemplate.baseDir, 'node_modules', 'helper-lib')
      );

      expect(fs.readlinkSync(path.join(myApp.baseDir, 'node_modules', 'test-lib'))).to.eql(
        path.join(appTemplate.baseDir, 'node_modules', 'test-lib')
      );

      expect(fs.existsSync(path.join(myApp.baseDir, 'hello.js'))).to.eql(true);
      expect(fs.existsSync(path.join(myApp.baseDir, 'layered-extra.js'))).to.eql(true);
    });

    it('can override a linked dependency with a new Project dependency', async () => {
      let baseProject = new Project('base');
      baseProject.addDependency('moment', '1.2.3');
      await baseProject.write();

      let project = Project.fromDir(baseProject.baseDir, { linkDeps: true });
      project.addDependency('moment', '4.5.6');
      await project.write();
      expect(fs.lstatSync(path.join(project.baseDir, 'node_modules', 'moment')).isSymbolicLink()).to.eql(false);
      expect(fs.readJSONSync(path.join(project.baseDir, 'node_modules', 'moment', 'package.json')).version).to.eql(
        '4.5.6'
      );
    });

    it('can override a Project dependency with a linked dependency', async () => {
      let dep = new Project('dep', '1.2.3');
      dep.files['first.js'] = '';
      await dep.write();

      let project = new Project('app');
      let dep2 = project.addDependency('dep', '4.5.6');
      dep2.files['second.js'] = '';
      project.linkDependency('dep', { target: dep.baseDir });
      await project.write();
      expect(fs.lstatSync(path.join(project.baseDir, 'node_modules', 'dep')).isSymbolicLink(), 'is symlink').is.true;
      expect(
        fs.readJSONSync(path.join(project.baseDir, 'node_modules', 'dep', 'package.json')).version,
        'version'
      ).to.eql('1.2.3');
      expect(fs.existsSync(path.join(project.baseDir, 'node_modules', 'dep', 'first.js')), 'first.js').is.true;
      expect(fs.existsSync(path.join(project.baseDir, 'node_modules', 'dep', 'second.js')), 'second.js').is.false;
    });

    it('can remove a linked dependency', async () => {
      let dep = new Project('dep', '1.2.3');
      dep.files['first.js'] = '';
      await dep.write();

      let project = new Project('app');
      project.linkDependency('dep', { target: dep.baseDir });
      project.removeDependency('dep');
      await project.write();
      expect(fs.readJSONSync(path.join(project.baseDir, 'package.json')).dependencies?.dep).to.be.undefined;
      expect(fs.existsSync(path.join(project.baseDir, 'node_modules', 'dep'))).is.false;
    });

    it('preserves linking behaviors through clone', async () => {
      let baseProject = new Project('base');
      await baseProject.write();

      let project = new Project('my-app');
      project.linkDependency('moment', { target: baseProject.baseDir });
      let cloned = project.clone();
      await cloned.write();
      expect(fs.readlinkSync(path.join(cloned.baseDir, 'node_modules', 'moment'))).to.eql(baseProject.baseDir);
    });

    it('can choose the requested semver range of a dependency', async () => {
      let proj = new Project();
      proj.addDependency('mylib', { version: '1.2.3', requestedRange: '^1' });
      await proj.write();
      expect(fs.readJSONSync(path.join(proj.baseDir, 'package.json')).dependencies.mylib).to.eql('^1');
    });

    it('can choose the requested semver range of a linked dependency', async () => {
      let baseProject = new Project('moment', '1.2.3');
      await baseProject.write();

      let project = new Project('my-app');
      project.linkDependency('moment', { target: baseProject.baseDir, requestedRange: '^1' });
      await project.write();
      expect(fs.readJSONSync(path.join(project.baseDir, 'package.json')).dependencies.moment).to.eql('^1');
    });

    it('links bin entry in package', async () => {
      let project = new Project('my-app', '1.0.0');
      project.pkg['license'] = 'MIT';

      project.addDependency({
        files: {
          'package.json': JSON.stringify({
            name: 'my-cli',
            version: '1.0.0',
            bin: { hello: 'hello.js', goodbye: 'goodbye.js' },
          }),
          'hello.js': `#!/usr/bin/env node
          require("./index.js")("hello")`,
          'goodbye.js': `#!/usr/bin/env node
          require("./index.js")("goodbye")`,
          'index.js': `module.exports = (s) => console.log(s)`,
        },
      });

      await project.write();

      const { execFileSync } = require('child_process');

      expect(
        execFileSync('yarn', ['-s', 'run', 'hello'], {
          cwd: project.baseDir,
          encoding: 'utf8',
        })
      ).to.eql('hello\n');

      const binPath = execFileSync('yarn', ['bin'], {
        cwd: project.baseDir,
        encoding: 'utf8',
      }).trimEnd();

      expect(execFileSync(path.join(binPath, 'goodbye'), { encoding: 'utf8' })).to.eql('goodbye\n');
    });

    it('should not share files', function () {
      let project1 = new Project('my-app', '1.0.0');
      project1.files['foo.js'] = 'foo';

      let project2 = new Project('my-app', '1.0.0');

      expect(project2.files['foo.js']).to.be.undefined;
    });
  });
}
