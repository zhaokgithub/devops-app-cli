const execSync = require('child_process').execSync;
const validateProjectName = require('validate-npm-package-name');
const semver = require('semver');
const unpack = require('tar-pack').unpack;
const fs = require('fs-extra');
const path = require('path');
const dns = require('dns');
const os = require('os');
const chalk = require('chalk');
const tmp = require('tmp');
const url = require('url');




function extractStream(stream, dest) {
    return new Promise((resolve, reject) => {
      stream.pipe(
        unpack(dest, err => {
          if (err) {
            reject(err);
          } else {
            resolve(dest);
          }
        })
      );
    });
  }
/**
 * @method const execSync = require('child_process').execSync;
 * @returns promise
 * @description 
 */
const getTemporaryDirectory = function() {
    return new Promise((resolve, reject) => {
      // Unsafe cleanup lets us recursively delete the directory if it contains
      // contents; by default it only allows removal if it's empty
      tmp.dir({ unsafeCleanup: true }, (err, tmpdir, callback) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            tmpdir: tmpdir,
            cleanup: () => {
              try {
                callback();
              } catch (ignored) {
                // Callback might throw and fail, since it's a temp directory the
                // OS will clean it up eventually...
              }
            },
          });
        }
      });
    });
  }
  /**
   * @method shouldUseYarn
   * @return {boolean} it judge if the yarn is existence.
   */
  const shouldUseYarn =function() {
    try {
      execSync('yarnpkg --version', { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * @method semver
   * @param {string} packageName 
   */
  function checkNodeVersion(packageName) {
    const packageJsonPath = path.resolve(
      process.cwd(),
      'node_modules',
      packageName,
      'package.json'
    );
  
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }
  
    const packageJson = require(packageJsonPath);
    if (!packageJson.engines || !packageJson.engines.node) {
      return;
    }
  
    if (!semver.satisfies(process.version, packageJson.engines.node)) {
      console.error(
        chalk.red(
          'You are running Node %s.\n' +
          'Create React App requires Node %s or higher. \n' +
          'Please update your version of Node.'
        ),
        process.version,
        packageJson.engines.node
      );
      process.exit(1);
    }
  }
  /**
   * @method checkAppName
   * @param {string} appName 
   * @description     //验证输入的报名是否合法
   */
  function checkAppName(appName) {
    const validationResult = validateProjectName(appName);
    if (!validationResult.validForNewPackages) {
      console.error(
        chalk.red(
          `Cannot create a project named ${chalk.green(
            `"${appName}"`
          )} because of npm naming restrictions:\n`
        )
      );
      [
        ...(validationResult.errors || []),
        ...(validationResult.warnings || []),
      ].forEach(error => {
        console.error(chalk.red(`  * ${error}`));
      });
      console.error(chalk.red('\nPlease choose a different project name.'));
      process.exit(1);
    }
  
    // TODO: there should be a single place that holds the dependencies
    const dependencies = ['react', 'react-dom', 'devops-react-server'].sort();
    if (dependencies.includes(appName)) {
      console.error(
        chalk.red(
          `Cannot create a project named ${chalk.green(
            `"${appName}"`
          )} because a dependency with the same name exists.\n` +
          `Due to the way npm works, the following names are not allowed:\n\n`
        ) +
        chalk.cyan(dependencies.map(depName => `  ${depName}`).join('\n')) +
        chalk.red('\n\nPlease choose a different project name.')
      );
      process.exit(1);
    }
  }

  function checkYarnVersion() {
    const minYarnPnp = '1.12.0';
    let hasMinYarnPnp = false;
    let yarnVersion = null;
    try {
      yarnVersion = execSync('yarnpkg --version')
        .toString()
        .trim();
      if (semver.valid(yarnVersion)) {
        hasMinYarnPnp = semver.gte(yarnVersion, minYarnPnp);
      } else {
        // Handle non-semver compliant yarn version strings, which yarn currently
        // uses for nightly builds. The regex truncates anything after the first
        // dash. See #5362.
        const trimmedYarnVersionMatch = /^(.+?)[-+].+$/.exec(yarnVersion);
        if (trimmedYarnVersionMatch) {
          const trimmedYarnVersion = trimmedYarnVersionMatch.pop();
          hasMinYarnPnp = semver.gte(trimmedYarnVersion, minYarnPnp);
        }
      }
    } catch (err) {
      // ignore
    }
    return {
      hasMinYarnPnp: hasMinYarnPnp,
      yarnVersion: yarnVersion,
    };
  }
  function setCaretRangeForRuntimeDeps(packageName) {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = require(packagePath);
  
    if (typeof packageJson.dependencies === 'undefined') {
      console.error(chalk.red('Missing dependencies in package.json'));
      process.exit(1);
    }
  
    const packageVersion = packageJson.dependencies[packageName];
    if (typeof packageVersion === 'undefined') {
      console.error(chalk.red(`Unable to find ${packageName} in package.json`));
      process.exit(1);
    }
  
    makeCaretRange(packageJson.dependencies, 'react');
    makeCaretRange(packageJson.dependencies, 'react-dom');
  
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + os.EOL);
  }
  function isSafeToCreateProjectIn(root, name) {
    const validFiles = [
      '.DS_Store',
      '.git',
      '.gitattributes',
      '.gitignore',
      '.gitlab-ci.yml',
      '.hg',
      '.hgcheck',
      '.hgignore',
      '.idea',
      '.npmignore',
      '.travis.yml',
      'docs',
      'LICENSE',
      'README.md',
      'mkdocs.yml',
      'Thumbs.db',
    ];
    // These files should be allowed to remain on a failed install, but then
    // silently removed during the next create.
    const errorLogFilePatterns = [
      'npm-debug.log',
      'yarn-error.log',
      'yarn-debug.log',
    ];
    const isErrorLog = file => {
      return errorLogFilePatterns.some(pattern => file.startsWith(pattern));
    };
  
    const conflicts = fs
      .readdirSync(root)
      .filter(file => !validFiles.includes(file))
      // IntelliJ IDEA creates module files before CRA is launched
      .filter(file => !/\.iml$/.test(file))
      // Don't treat log files from previous installation as conflicts
      .filter(file => !isErrorLog(file));
  
    if (conflicts.length > 0) {
      console.log(
        `The directory ${chalk.green(name)} contains files that could conflict:`
      );
      console.log();
      for (const file of conflicts) {
        try {
          const stats = fs.lstatSync(path.join(root, file));
          if (stats.isDirectory()) {
            console.log(`  ${chalk.blue(`${file}/`)}`);
          } else {
            console.log(`  ${file}`);
          }
        } catch (e) {
          console.log(`  ${file}`);
        }
      }
      console.log();
      console.log(
        'Either try using a new directory name, or remove the files listed above.'
      );
  
      return false;
    }
  
    // Remove any log files from a previous installation.
    fs.readdirSync(root).forEach(file => {
      if (isErrorLog(file)) {
        fs.removeSync(path.join(root, file));
      }
    });
    return true;
  }
  
  function makeCaretRange(dependencies, name) {
    const version = dependencies[name];
  
    if (typeof version === 'undefined') {
      console.error(chalk.red(`Missing ${name} dependency in package.json`));
      process.exit(1);
    }
  
    let patchedVersion = `^${version}`;
  
    if (!semver.validRange(patchedVersion)) {
      console.error(
        `Unable to patch ${name} dependency version because version ${chalk.red(
          version
        )} will become invalid ${chalk.red(patchedVersion)}`
      );
      patchedVersion = version;
    }
  
    dependencies[name] = patchedVersion;
  }

  //dns：用来检测是否能够请求到指定的地址。npm地址
function checkIfOnline(useYarn) {
    if (!useYarn) {
      // Don't ping the Yarn registry.
      // We'll just assume the best case.
      return Promise.resolve(true);
    }
  
    return new Promise(resolve => {
      dns.lookup('registry.yarnpkg.com', err => {
        let proxy;
        if (err != null && (proxy = getProxy())) {
          // If a proxy is defined, we likely can't resolve external hostnames.
          // Try to resolve the proxy name as an indication of a connection.
          dns.lookup(url.parse(proxy).hostname, proxyErr => {
            resolve(proxyErr == null);
          });
        } else {
          resolve(err == null);
        }
      });
    });
  }
//用于检测npm是否在正确的目录下执行
function checkThatNpmCanReadCwd() {
    const cwd = process.cwd();
    let childOutput = null;
    try {
      // Note: intentionally using spawn over exec since
      // the problem doesn't reproduce otherwise.
      // `npm config list` is the only reliable way I could find
      // to reproduce the wrong path. Just printing process.cwd()
      // in a Node process was not enough.
      childOutput = spawn.sync('npm', ['config', 'list']).output.join('');
    } catch (err) {
      // Something went wrong spawning node.
      // Not great, but it means we can't do this check.
      // We might fail later on, but let's continue.
      return true;
    }
    if (typeof childOutput !== 'string') {
      return true;
    }
    const lines = childOutput.split('\n');
    // `npm config list` output includes the following line:
    // "; cwd = C:\path\to\current\dir" (unquoted)
    // I couldn't find an easier way to get it.
    const prefix = '; cwd = ';
    const line = lines.find(line => line.startsWith(prefix));
    if (typeof line !== 'string') {
      // Fail gracefully. They could remove it.
      return true;
    }
    const npmCWD = line.substring(prefix.length);
    if (npmCWD === cwd) {
      return true;
    }
    console.error(
      chalk.red(
        `Could not start an npm process in the right directory.\n\n` +
        `The current directory is: ${chalk.bold(cwd)}\n` +
        `However, a newly started npm process runs in: ${chalk.bold(
          npmCWD
        )}\n\n` +
        `This is probably caused by a misconfigured system terminal shell.`
      )
    );
    if (process.platform === 'win32') {
      console.error(
        chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKLM\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n\n` +
        chalk.red(`Try to run the above two lines in the terminal.\n`) +
        chalk.red(
          `To learn more about this problem, read: https://blogs.msdn.microsoft.com/oldnewthing/20071121-00/?p=24433/`
        )
      );
    }
    return false;
  }

function getProxy() {
    if (process.env.https_proxy) {
      return process.env.https_proxy;
    } else {
      try {
        // Trying to read https-proxy from .npmrc
        let httpsProxy = execSync('npm config get https-proxy')
          .toString()
          .trim();
        return httpsProxy !== 'null' ? httpsProxy : undefined;
      } catch (e) {
        return;
      }
    }
  }
  
  module.exports = {
    extractStream,
    shouldUseYarn,
    getTemporaryDirectory,
    checkAppName,
    checkNodeVersion,
    checkYarnVersion,
    setCaretRangeForRuntimeDeps,
    isSafeToCreateProjectIn,
    checkThatNpmCanReadCwd,
    checkIfOnline
  }