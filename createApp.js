/**
 * Copyright 2019-12-25
 */

'use strict';

const chalk = require('chalk');
const commander = require('commander');
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const hyperquest = require('hyperquest');
const inquirer = require('inquirer');
const os = require('os');
const path = require('path');
const semver = require('semver');
const spawn = require('cross-spawn');
const Util = require('./lib/util');

const packageJson = require('./package.json');

let projectName;
//1.创建前准备
const program = new commander.Command(packageJson.name)
  .version(packageJson.version)
  //1.1 初始化commander工具
  .arguments('<project-directory>')
  .usage(`${chalk.green('<project-directory>')} [options]`)
  //1.2 获取输入的包名
  .action(name => {
    projectName = name;
  })
  //1.3 初始化commader参数
  .option('--verbose', 'print additional logs')
  .option('--info', 'print environment debug info')
  .option(
    '--scripts-version <alternative-package>',
    'Manually specified the version of devops-react-server'
  )
  .option('--use-npm')
  .option('--use-pnp')
  .allowUnknownOption()
  .on('--help', () => {
    console.log(`    Only ${chalk.green('<project-directory>')} is required.`);
    console.log();
    console.log(
      `    A custom ${chalk.cyan('--scripts-version')} can be one of:`
    );
    console.log(`      - a specific npm version: ${chalk.green('0.8.2')}`);
    console.log(`      - a specific npm tag: ${chalk.green('@next')}`);
    console.log(
      `      - a custom fork published on npm: ${chalk.green(
        'my-devops-react-server'
      )}`
    );
    console.log(
      `      - a local path relative to the current working directory: ${chalk.green(
        'file:../my-devops-react-server'
      )}`
    );
    console.log(
      `      - a .tgz archive: ${chalk.green(
        'https://mysite.com/my-devops-react-server-0.8.2.tgz'
      )}`
    );
    console.log(
      `      - a .tar.gz archive: ${chalk.green(
        'https://mysite.com/my-devops-react-server-0.8.2.tar.gz'
      )}`
    );
    console.log(
      `    It is not needed unless you specifically want to use a fork.`
    );

    console.log(
      `    If you have any problems, do not hesitate to file an issue:`
    );
    console.log(
      `      ${chalk.cyan(
        'https://github.com/zhaokgithub/devops-react-cli/issues/new'
      )}`
    );
    console.log();
  })
  .parse(process.argv);

if (program.info) {
  console.log(chalk.bold('当前环境:'));
  console.log(
    `\n  当前devops-react-cli包版本号为: ${packageJson.version}`
  );
  console.log(`运行路径为： ${__dirname}`);
  return envinfo
    .run(
      {
        System: ['OS', 'CPU'],
        Binaries: ['Node', 'npm', 'Yarn'],
        Browsers: ['Chrome', 'Edge', 'Internet Explorer', 'Firefox', 'Safari'],
        npmPackages: ['react', 'react-dom', 'devops-react-server'],
        npmGlobalPackages: ['devops-react-cli'],
      },
      {
        duplicates: true,
        showNotFound: true,
      }
    )
    .then(console.log);
} else {
  console.log('program is not exitence')
}

if (typeof projectName === 'undefined') {
  console.error('请输入工程名称: ');
  console.log(`${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}`);
  console.log('例如:');
  console.log(`  ${chalk.cyan(program.name())} ${chalk.green('my-react-app')}`);
  console.log(
    `运行命令${chalk.cyan(`${program.name()} --help`)}去查看参数选项`
  );
  process.exit(1);
}

createApp(projectName, program.verbose,
  program.scriptsVersion,
  program.useNpm,
  program.usePnp,
  program.typescript);

function createApp(name, verbose, version, useNpm, usePnp) {
  //1.4 获取当前nodejs环境
  const unsupportedNodeVersion = !semver.satisfies(process.version, '>=8.10.0');
  // 1.5 当nodejs版本过低 并且是要安装typescript模版时则退出安装
  console.log(
    chalk.yellow(
      `You are using Node ${process.version} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
      `Please update to Node 8.10 or higher for a better, fully supported experience.\n`
    )
  );
  //2 开始创建
  //2.1 获取项目绝对路径
  const root = path.resolve(name);
  //2.2 获取项目名称
  const appName = path.basename(root);

  Util.checkAppName(appName);
  //2.3 创建项目空目录
  fs.ensureDirSync(name);
  if (!Util.isSafeToCreateProjectIn(root, name)) {
    process.exit(1);
  }
  console.log();
  console.log(`Creating a new React app in ${chalk.green(root)}.`);
  console.log();
  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true
  };
  //2.4 创建package.json文件
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  );
  // 2.5 判断是否使用yarn 和 npm
  const useYarn = useNpm ? false : Util.shouldUseYarn();
  const originalDirectory = process.cwd();
  process.chdir(root);
  if (!useYarn && !Util.checkThatNpmCanReadCwd()) {
    process.exit(1);
  }

  if (!useYarn) {
    const npmInfo = Util.checkNpmVersion();
    if (!npmInfo.hasMinNpm) {
      if (npmInfo.npmVersion) {
        console.log(
          chalk.yellow(
            `You are using npm ${npmInfo.npmVersion} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
            `Please update to npm 5 or higher for a better, fully supported experience.\n`
          )
        );
      }
      // Fall back to latest supported devops-react-server for npm 3
      version = 'devops-react-server@0.9.x';
    }
  } else if (usePnp) {
    //校验包名是否合法并且依赖包中没有与他同名的
    const yarnInfo = Util.checkYarnVersion();
    if (!yarnInfo.hasMinYarnPnp) {
      if (yarnInfo.yarnVersion) {
        console.log(
          chalk.yellow(
            `You are using Yarn ${yarnInfo.yarnVersion} together with the --use-pnp flag, but Plug'n'Play is only supported starting from the 1.12 release.\n\n` +
            `Please update to Yarn 1.12 or higher for a better, fully supported experience.\n`
          )
        );
      }
      // 1.11 had an issue with webpack-dev-middleware, so better not use PnP with it (never reached stable, but still)
      usePnp = false;
    }
  }

  if (useYarn) {
    let yarnUsesDefaultRegistry = true;
    try {
      yarnUsesDefaultRegistry =
        execSync('yarnpkg config get registry')
          .toString()
          .trim() === 'https://registry.yarnpkg.com';
    } catch (e) {
      // ignore
    }
    if (yarnUsesDefaultRegistry) {
      fs.copySync(
        require.resolve('./yarn.lock.cached'),
        path.join(root, 'yarn.lock')
      );
    }
  }
  run(root, appName, version, verbose, originalDirectory, useYarn, usePnp);
}

//3. 安装依赖前准备
//3.1 安装依赖前的准备
function run(root, appName, version, verbose, originalDirectory, useYarn, usePnp) {
  let template = null
  Promise.all([
    getDevServePackage(version, originalDirectory),
    getTemplateInstallPackage(template, originalDirectory),
  ]).then(([packageToInstall, templateToInstall]) => {
    //3.1 获取需要初始化安装的依赖
    new Promise(getCustomInstallPackage).then((customInstall) => {
      const allDependencies = ['react', 'react-dom', packageToInstall, ...customInstall.features];
      console.log(allDependencies)
      console.log('Installing packages. This might take a couple of minutes.');
      //3.2 获取安装包的信息
      Promise.all([
        getPackageInfo(packageToInstall),
        getPackageInfo(templateToInstall),
      ])
        .then(([packageInfo, templateInfo]) =>
          //3.3 检查是否能正常安装
          Util.checkIfOnline(useYarn).then(isOnline => ({
            isOnline,
            packageInfo,
            templateInfo,
          }))
        )
        .then(({ isOnline, packageInfo, templateInfo }) => {
          let packageVersion = semver.coerce(packageInfo.version);

          const templatesVersionMinimum = '3.3.0';

          // Assume compatibility if we can't test the version.
          if (!semver.valid(packageVersion)) {
            packageVersion = templatesVersionMinimum;
          }

          // Only support templates when used alongside new devops-react-server versions.
          const supportsTemplates = semver.gte(
            packageVersion,
            templatesVersionMinimum
          );
          if (supportsTemplates) {
            allDependencies.push(templateToInstall);
          } else if (template) {
            console.log('');
            console.log(
              `The ${chalk.cyan(packageInfo.name)} version you're using ${
              packageInfo.name === 'devops-react-server'
                ? 'is not'
                : 'may not be'
              } compatible with the ${chalk.cyan('--template')} option.`
            );
            console.log('');
          }

          // TODO: Remove with next major release.
          //typescript 需要安装的包
          if (!supportsTemplates && (template || '').includes('typescript')) {
            allDependencies.push(
              '@types/node',
              '@types/react',
              '@types/react-dom',
              '@types/jest',
              'typescript'
            );
          }
          console.log(
            `Installing ${chalk.cyan('react')}, ${chalk.cyan(
              'react-dom'
            )}, and ${chalk.cyan(packageInfo.name)}${
            supportsTemplates ? ` with ${chalk.cyan(templateInfo.name)}` : ''
            }...`
          );
          //3.5 执行安装包
          return install(root, useYarn, usePnp, allDependencies, verbose, isOnline)
            .then(() => ({
              packageInfo,
              supportsTemplates,
              templateInfo,
            }));
        })
        .then(async ({ packageInfo, supportsTemplates, templateInfo }) => {
          //5 初始化项目
          const packageName = packageInfo.name;
          const templateName = supportsTemplates ? templateInfo.name : undefined;
          Util.checkNodeVersion(packageName);
          Util.setCaretRangeForRuntimeDeps(packageName);
          const pnpPath = path.resolve(process.cwd(), '.pnp.js');
          const nodeArgs = fs.existsSync(pnpPath) ? ['--require', pnpPath] : [];
          // 5.1 开始执行初始化项目脚本
          // 5.2 复制项目模版文件
          await executeNodeScript(
            {
              cwd: process.cwd(),
              args: nodeArgs,
            },
            //5.3 传入执行行初始化项目的参数
            [root, appName, verbose, originalDirectory, templateName],
            `
          var init = require('${packageName}/scripts/init.js');
          init.apply(null, JSON.parse(process.argv[1]));
        `
          );
        })
        .catch(reason => {
          console.log('Aborting installation.');
          if (reason.command) {
            console.log(`  ${chalk.cyan(reason.command)} has failed.`);
          } else {
            console.log(
              chalk.red('Unexpected error. Please report it as a bug:')
            );
            console.log(reason);
          }
          console.log();
          // On 'exit' we will delete these files from target directory.
          const knownGeneratedFiles = [
            'package.json',
            'yarn.lock',
            'node_modules',
          ];
          const currentFiles = fs.readdirSync(path.join(root));
          currentFiles.forEach(file => {
            knownGeneratedFiles.forEach(fileToMatch => {
              // This removes all knownGeneratedFiles.
              if (file === fileToMatch) {
                console.log(`Deleting generated file... ${chalk.cyan(file)}`);
                fs.removeSync(path.join(root, file));
              }
            });
          });
          const remainingFiles = fs.readdirSync(path.join(root));
          if (!remainingFiles.length) {
            // Delete target folder if empty
            console.log(
              `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
                path.resolve(root, '..')
              )}`
            );
            process.chdir(path.resolve(root, '..'));
            fs.removeSync(path.join(root));
          }
          console.log('Done.');
          process.exit(1);
        });

    })
  });
}

//或取devops-react-server安装的版本号
function getDevServePackage(version, originalDirectory) {
  let packageToInstall = 'devops-react-server';
  const validSemver = semver.valid(version);
  //自定义dev-react-server版本号时候
  if (validSemver) {
    packageToInstall += `@${validSemver}`;
  } else if (version) {
    if (version[0] === '@' && !version.includes('/')) {
      packageToInstall += version;
    } else if (version.match(/^file:/)) {
      packageToInstall = `file:${path.resolve(
        originalDirectory,
        version.match(/^file:(.*)?$/)[1]
      )}`;
    } else {
      // for tar.gz or alternative paths
      packageToInstall = version;
    }
  }
  return Promise.resolve(packageToInstall);
}
function getCustomInstallPackage(resolve, reject) {
  inquirer.prompt([{
    type: 'checkbox',
    name: 'features',
    message: 'Check the features needed for your project?',
    choices: [
      {
        name: 'mobx'
      },
      {
        name: 'react-router'
      },
      {
        name: 'antd'
      },
      {
        name: 'dayjs'
      },
    ]
  }])
    .then((answers) => {
      resolve(answers)
    })
    .catch(err => {
      console.log(chalk.red(err))
    })
}
//安装devops-cra-temp以及他的相关依赖
function getTemplateInstallPackage(template, originalDirectory) {
  let templateToInstall = 'devops-cra-temp';
  if (template) {
    if (template.match(/^file:/)) {
      templateToInstall = `file:${path.resolve(
        originalDirectory,
        template.match(/^file:(.*)?$/)[1]
      )}`;
    } else if (
      template.includes('://') ||
      template.match(/^.+\.(tgz|tar\.gz)$/)
    ) {
      // for tar.gz or alternative paths
      templateToInstall = template;
    } else {
      // Add prefix 'devops-cra-temp-' to non-prefixed templates, leaving any
      // @scope/ intact.
      const packageMatch = template.match(/^(@[^/]+\/)?(.+)$/);
      const scope = packageMatch[1] || '';
      const templateName = packageMatch[2];

      const name = templateName.startsWith(templateToInstall)
        ? templateName
        : `${templateToInstall}-${templateName}`;
      templateToInstall = `${scope}${name}`;
    }
  }

  return Promise.resolve(templateToInstall);
}
//获取所需要依赖信息
// 4安装所需依赖
console.log('========开始安装所有依赖==========')
function install(root, useYarn, usePnp, dependencies, verbose, isOnline) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    //4.1 判断是npm或yarn来安装
    if (useYarn) {
      command = 'yarnpkg';
      args = ['add', '--exact'];
      if (!isOnline) {
        args.push('--offline');
      }
      if (usePnp) {
        args.push('--enable-pnp');
      }
      [].push.apply(args, dependencies);

      args.push('--cwd');
      args.push(root);

      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'));
        console.log(chalk.yellow('Falling back to the local Yarn cache.'));
      }
    } else {
      command = 'npm';
      args = [
        'install',
        '--save',
        '--save-exact',
        '--loglevel',
        'error',
      ].concat(dependencies);
      if (usePnp) {
        console.log(chalk.yellow("NPM doesn't support PnP."));
        console.log(chalk.yellow('Falling back to the regular installs.'));
        console.log();
      }
    }

    if (verbose) {
      args.push('--verbose');
    }
    //4.2 执行安装命令
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}


// 提取包名和包的version
function getPackageInfo(installPackage) {
  if (installPackage.match(/^.+\.(tgz|tar\.gz)$/)) {
    return Util.getTemporaryDirectory()
      .then(obj => {
        let stream;
        if (/^http/.test(installPackage)) {
          stream = hyperquest(installPackage);
        } else {
          stream = fs.createReadStream(installPackage);
        }
        return Util.extractStream(stream, obj.tmpdir).then(() => obj);
      })
      .then(obj => {
        const { name, version } = require(path.join(
          obj.tmpdir,
          'package.json'
        ));
        obj.cleanup();
        return { name, version };
      })
      .catch(err => {
        // The package name could be with or without semver version, e.g. devops-react-server-0.2.0-alpha.1.tgz
        // However, this function returns package name only without semver version.
        console.log(
          `Could not extract the package name from the archive: ${err.message}`
        );
        const assumedProjectName = installPackage.match(
          /^.+\/(.+?)(?:-\d+.+)?\.(tgz|tar\.gz)$/
        )[1];
        console.log(
          `Based on the filename, assuming it is "${chalk.cyan(
            assumedProjectName
          )}"`
        );
        return Promise.resolve({ name: assumedProjectName });
      });
  } else if (installPackage.startsWith('git+')) {
    // Pull package name out of git urls e.g:
    // git+https://github.com/mycompany/devops-react-server.git
    // git+ssh://github.com/mycompany/devops-react-server.git#v1.2.3
    return Promise.resolve({
      name: installPackage.match(/([^/]+)\.git(#.*)?$/)[1],
    });
  } else if (installPackage.match(/.+@/)) {
    // Do not match @scope/ when stripping off @version or @tag
    return Promise.resolve({
      name: installPackage.charAt(0) + installPackage.substr(1).split('@')[0],
      version: installPackage.split('@')[1],
    });
  } else if (installPackage.match(/^file:/)) {
    const installPackagePath = installPackage.match(/^file:(.*)?$/)[1];
    const { name, version } = require(path.join(
      installPackagePath,
      'package.json'
    ));
    return Promise.resolve({ name, version });
  }
  return Promise.resolve({ name: installPackage });
}

//执行nodejs脚本
function executeNodeScript({ cwd, args }, data, source) {
  console.log('=========execute node script=======')
  console.log(cwd)
  console.log(args)
  console.log(data)
  console.log(source)
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...args, '-e', source, '--', JSON.stringify(data)],
      { cwd, stdio: 'inherit' }
    );

    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `node ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}
