/**
 * Copyright 2019-12-25
 */

'use strict';

const chalk = require('chalk');
const commander = require('commander');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const os = require('os');
const path = require('path');
const semver = require('semver');
const spawn = require('cross-spawn');
const Util = require('./lib/util');
const { initDevpencies } = require('./config/config')
const packageJson = require('./package.json');
const initProject = require('./lib/init');

let projectName;
let cmd;
//1.创建前准备
const program = new commander.Command(packageJson.name)
  .version(packageJson.version)
  //1.1 初始化commander工具
  .arguments('<cmd> [env]')
  .usage(`${chalk.green('<project-directory>')} [options]`)
  //1.2 获取输入的包名
  .action((cmd, name) => {
    cmd = cmd
    if (cmd === 'create') {
      projectName = name;
    }
    if (cmd === 'serve' && !name) {
      let html = name ? name : 'index.html'
      startDevServe(html)
      return
    }
  })
  .option('--verbose', 'print additional logs')
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

if (cmd == 'serve') {
  return
}

if (typeof projectName === 'undefined') {
  console.log(`${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}`);
  console.log('例如:');
  console.log(`  ${chalk.cyan(program.name())} ${chalk.green('my-react-app')}`);
  console.log(`运行命令${chalk.cyan(`${program.name()} --help`)}去查看参数选项`);
  process.exit(1);
}

createApp(projectName, program.verbose);

function createApp(name, verbose) {
  //1.4 获取当前nodejs环境
  // 1.5 当nodejs版本过低 并且是要安装typescript模版时则退出安装
  if (!semver.satisfies(process.version, '>=8.10.0')) {
    console.log(
      chalk.yellow(`Please update to Node 8.10 or higher for a better, fully supported experience.\n`)
    );
  }

  //get the absolute path
  const root = path.resolve(name);
  const appName = path.basename(root);

  Util.checkAppName(appName);
  //create the project folder
  fs.ensureDirSync(name);
  if (!Util.isSafeToCreateProjectIn(root, name)) {
    process.exit(1);
  }
  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  );
  const originalDirectory = process.cwd();
  process.chdir(root);
  if (!Util.checkThatNpmCanReadCwd()) {
    process.exit(1);
  }

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
  run(root, appName, verbose, originalDirectory, false);
}

async function run(root, appName, verbose, originalDirectory) {
  let template = null
  let templateToInstall = await Util.getTemplateInstallPackage(template, originalDirectory)
  //3.1 获取需要初始化安装的依赖
  new Promise(getCustomInstallPackage).then(async (customInstall) => {
    const allDependencies = [...initDevpencies, ...customInstall.features];
    //3.2 获取安装包的信息
    let templateInfo = await Util.getPackageInfo(templateToInstall)
    //3.3 检查是否能正常安装
    Util.checkIfOnline(false).then(isOnline => ({
      isOnline,
      templateInfo,
    }))
      .then(({ isOnline, templateInfo }) => {
        console.log('starting install packages')
        return install(root, allDependencies, verbose, isOnline)
          .then(() => ({
            templateInfo,
          }));
      })
      .then(async ({ templateInfo }) => {
        // init project
        const templateName = templateInfo ? templateInfo.name : undefined;
        // Util.checkNodeVersion("devops-react-server");
        // Util.setCaretRangeForRuntimeDeps("devops-react-server");
        const pnpPath = path.resolve(process.cwd(), '.pnp.js');
        const nodeArgs = fs.existsSync(pnpPath) ? ['--require', pnpPath] : [];
        console.log(process.cwd())
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
}

//获取所需要依赖信息
// 4安装所需依赖
function install(root, dependencies, verbose, isOnline) {
  console.log('Starting install the list of dependencies:')
  return new Promise((resolve, reject) => {
    let command;
    let args;
    //4.1 判断是npm或yarn来安装
    command = 'npm';
    args = [
      'install',
      '--save',
      '--save-exact',
      '--loglevel',
      'error',
    ].concat(dependencies);

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

//执行nodejs脚本
function executeNodeScript({ cwd, args }, data, source) {
  console.log(chalk.green('Starting run dev-server-cli init'))
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
//Start the local service
function startDevServe(html) {
  const result = spawn.sync('serve', [html], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.log("starting install the devpencies of cli")
    spawn.sync('npm', ['install', 'serve', '-g'], { stdio: 'inherit' });
    spawn.sync('serve', [html], { stdio: 'inherit' });
  }
}

function getCustomInstallPackage(resolve, reject) {
  inquirer.prompt([{
    type: 'checkbox',
    name: 'features',
    message: '请选择项目中需要的依赖：',
    choices: [
      { name: 'js-cookie' },
      { name: '@antv/g2' },
      { name: '@antv/g6' },
      //先强制安装 后期改可选
      // { name: 'mobx' },
      { name: 'dayjs' }]
  }])
    .then((answers) => {
      if (answers && answers.length > 0) {
        // if (answers.includes('mobx')) {
        //   answers.push('mobx-react')
        // }
        // if (answers.includes('react-router')) {
        //   answers.push('react-router-dom')
        // }
      }
      resolve(answers)
    })
    .catch(err => {
      console.log(chalk.red(err))
    })
}