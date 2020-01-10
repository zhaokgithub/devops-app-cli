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
  .option('--use-npm')
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
      `    It is not needed unless you specifically want to use a fork.`
    );

    console.log(
      `If you have any problems, do not hesitate to file an issue:`
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

createApp(projectName, program.verbose,  program.useNpm,);

function createApp(name, verbose, useNpm) {
  //1.4 获取当前nodejs环境
  // 1.5 当nodejs版本过低 并且是要安装typescript模版时则退出安装
  if (!semver.satisfies(process.version, '>=8.10.0')) {
    console.log(
      chalk.yellow(`Please update to Node 8.10 or higher for a better, fully supported experience.\n`)
    );
  }

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
  console.log(`Creating a new React app in ${chalk.green(root)}.`);
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
  run(root, appName, verbose, originalDirectory, useYarn);
}

//3. 安装依赖前准备
//3.1 安装依赖前的准备
function run(root, appName, verbose, originalDirectory, useYarn) {
  let template = null
  Promise.all([
    Util.getTemplateInstallPackage(template, originalDirectory),
  ]).then(([ templateToInstall]) => {
    //3.1 获取需要初始化安装的依赖
    new Promise(getCustomInstallPackage).then((customInstall) => {
      const allDependencies = ['react', 'react-dom', 'devops-react-server', ...customInstall.features];
      console.log('Installing packages. This might take a couple of minutes.');
      //3.2 获取安装包的信息
      Promise.all([
        Util.getPackageInfo('devops-react-server'),
        Util.getPackageInfo(templateToInstall),
      ])
        .then(([templateInfo]) =>
          //3.3 检查是否能正常安装
          Util.checkIfOnline(useYarn).then(isOnline => ({
            isOnline,
            packageInfo,
            templateInfo,
          }))
        )
        .then(({ isOnline, templateInfo }) => {
          // Only support templates when used alongside new devops-react-server versions.
          const supportsTemplates = semver.gte(
            "packageVersion",
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
            )}, and ${chalk.cyan("devops-react-server")}${
            supportsTemplates ? ` with ${chalk.cyan(templateInfo.name)}` : ''
            }...`
          );
          //3.5 执行安装包
          return install(root, useYarn, usePnp, allDependencies, verbose, isOnline)
            .then(() => ({
              supportsTemplates,
              templateInfo,
            }));
        })
        .then(async ({  supportsTemplates, templateInfo }) => {
          //5 初始化项目
          const templateName = supportsTemplates ? templateInfo.name : undefined;
          Util.checkNodeVersion("devops-react-server");
          Util.setCaretRangeForRuntimeDeps("devops-react-server");
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
          var init = require('devops-react-server/scripts/init.js');
          init.apply(null, JSON.parse(process.argv[1]));
        `
          );
        })
        .catch(reason => {
          if (reason.command) {
            console.log(`  ${chalk.cyan(reason.command)} has failed.`);
          } else {
            console.log(
              chalk.red('Unexpected error. Please report it as a bug:')
            );
            console.log(reason);
          }
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
        name: 'axios'
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

//获取所需要依赖信息
// 4安装所需依赖
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

//执行nodejs脚本
function executeNodeScript({ cwd, args }, data, source) {
  console.log('Starting run dev-server-cli init')
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
