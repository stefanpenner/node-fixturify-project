# Changelog




## v7.1.1 (2024-05-02)

#### :rocket: Enhancement
* [#94](https://github.com/stefanpenner/node-fixturify-project/pull/94) Publish with sourcemaps ([@ef4](https://github.com/ef4))

#### :bug: Bug Fix
* [#95](https://github.com/stefanpenner/node-fixturify-project/pull/95) Handle "transitive peer deps" correctly when hardlinking dependencies ([@ef4](https://github.com/ef4))

#### Committers: 1
- Edward Faulkner ([@ef4](https://github.com/ef4))

## v7.1.0 (2024-05-01)

#### :rocket: Enhancement
* [#93](https://github.com/stefanpenner/node-fixturify-project/pull/93) Apply the "pnpm pack" rules when hard linking in-monorepo deps ([@ef4](https://github.com/ef4))

#### :bug: Bug Fix
* [#92](https://github.com/stefanpenner/node-fixturify-project/pull/92) fs-extra is a dep not a dev-dep ([@ef4](https://github.com/ef4))

#### Committers: 1
- Edward Faulkner ([@ef4](https://github.com/ef4))

## v7.0.0 (2024-04-09)

#### :boom: Breaking Change
* [#87](https://github.com/stefanpenner/node-fixturify-project/pull/87) Closes [#86](https://github.com/stefanpenner/node-fixturify-project/issues/86) Files leak across instances of Project ([@lolmaus](https://github.com/lolmaus)). This is marked as breaking because it changes the merging behavior of the `files` argument to `new Project` to do deep merging when it didn't before.

#### :house: Internal
* [#89](https://github.com/stefanpenner/node-fixturify-project/pull/89) swap to pnpm ([@mansona](https://github.com/mansona))

#### Committers: 2
- Andrey Mikhaylov (lolmaus) ([@lolmaus](https://github.com/lolmaus))
- Chris Manson ([@mansona](https://github.com/mansona))

## v6.0.0 (2023-08-03)

#### :boom: Breaking Change
* [#85](https://github.com/stefanpenner/node-fixturify-project/pull/85) Bump Node to 16, drop deprecated methods ([@lolmaus](https://github.com/lolmaus))

#### :bug: Bug Fix
* [#82](https://github.com/stefanpenner/node-fixturify-project/pull/82) throw if no version is specified in dependency's package.json ([@cafreeman](https://github.com/cafreeman))

#### :house: Internal
* [#83](https://github.com/stefanpenner/node-fixturify-project/pull/83) Maintenance: bump Node, typescript and type-fest ([@lolmaus](https://github.com/lolmaus))

#### Committers: 4
- Andrey Mikhaylov (lolmaus) ([@lolmaus](https://github.com/lolmaus))
- Chris Freeman ([@cafreeman](https://github.com/cafreeman))
- Edward Faulkner ([@ef4](https://github.com/ef4))
- Stefan Penner ([@stefanpenner](https://github.com/stefanpenner))

## v5.2.0 (2022-10-26)

#### :rocket: Enhancement
* [#76](https://github.com/stefanpenner/node-fixturify-project/pull/76) provide access to baseDir before write ([@ef4](https://github.com/ef4))

#### Committers: 1
- Edward Faulkner ([@ef4](https://github.com/ef4))

## v5.1.0 (2022-09-15)

#### :rocket: Enhancement
* [#73](https://github.com/stefanpenner/node-fixturify-project/pull/73) allow linking to other Projects ([@ef4](https://github.com/ef4))

#### Committers: 1
- Edward Faulkner ([@ef4](https://github.com/ef4))

## v5.0.3 (2022-05-21)

#### :bug: Bug Fix
* [#70](https://github.com/stefanpenner/node-fixturify-project/pull/70) Fix transitive peer dependencies ([@ef4](https://github.com/ef4))

#### Committers: 1
- Edward Faulkner ([@ef4](https://github.com/ef4))

## v5.0.2 (2022-04-18)

#### :bug: Bug Fix
* [#69](https://github.com/stefanpenner/node-fixturify-project/pull/69) Fixes ESM output ([@scalvert](https://github.com/scalvert))

#### :memo: Documentation
* [#67](https://github.com/stefanpenner/node-fixturify-project/pull/67) Readme typo fix ([@thoov](https://github.com/thoov))

#### Committers: 2
- Steve Calvert ([@scalvert](https://github.com/scalvert))
- Travis Hoover ([@thoov](https://github.com/thoov))


## v5.0.1 (2022-04-15)

#### :boom: Breaking Change
* [#62](https://github.com/stefanpenner/node-fixturify-project/pull/62) Converts to multi-target publishing (cjs/esm) w/ declaration files. ([@scalvert](https://github.com/scalvert))

#### :rocket: Enhancement
* [#64](https://github.com/stefanpenner/node-fixturify-project/pull/64) Adding write(dirJSON), mergeFiles APIs ([@scalvert](https://github.com/scalvert))

#### :memo: Documentation
* [#66](https://github.com/stefanpenner/node-fixturify-project/pull/66) Add readme-api-generator to auto-generate API documentation for README ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v4.1.2 (2022-04-12)

#### :bug: Bug Fix
* [#59](https://github.com/stefanpenner/node-fixturify-project/pull/59) Fixes typeguard to correctly evaluate Error type when globals don't match ([@scalvert](https://github.com/scalvert))

#### :house: Internal
* [#60](https://github.com/stefanpenner/node-fixturify-project/pull/60) Adding release-it setup ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))



# 4.0.2
- [BUGFIX] Fix odd double project directory structure when resolving linked deps

# 4.0.1

- [BUGFIX] some cross-device scenarios were broken by last minute changes in the previous release, this fixes them.

# 4.0.0

- [ENHANCEMENT] We now ensure that dependencies linked into a project always see the correct `peerDependencies`.
- [BREAKING] the `linkDeps` argument originally linked both dependencies and devDependencies. In the course of implementing correct peerDep support, it was discovered that linking devDependencies is not typically desirable, so `linkDeps` has switched to only link `dependencies`, and you should pass `linkDevDeps` to explicitly opt in to lining `devDependencies`.

# 3.0.2

- [BUGFIX] fix CB API

# 3.0.1

- restore CB API
- improve changelog

# 3.0.0

- Drop legacy node support
- Support Dependency Linking
- [Breaking] `project.root` has been removed you can now use `project.baseDir`;
- Add Changelog for moving forward
- [Breaking] the project is now required via `const { Project } = require('fixturify-project')`
