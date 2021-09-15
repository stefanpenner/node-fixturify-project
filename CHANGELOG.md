
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
