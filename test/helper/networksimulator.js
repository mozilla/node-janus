'use strict';

var exec = require('child_process').spawn;
var read = require('read');
var config = require('config');

// Network profiles
// latencies in ms, bandwidths in Kbit/s
var NETWORK_CONFIGS = exports.networkConfigs = {
  '2G': {
    latency: 1000,
    bandwidth: 100,
  },
  '3G': {
    latency: 500,
    bandwidth: 512,
  },
  '4G': {
    latency: 100,
    bandwidth: 1024,
  },
  default: {
    latency: null,
    bandwidth: null,
  }
};

// Run the given command with sudo and ask for password if necessary.
function sudoExec(cmd, callback) {
  var child = exec('sudo', ['-S', '-p', '#prompt#'].concat(cmd),
                   { stdio: 'pipe' });

  child.stderr.on('data', function(data) {
    if (data.toString().indexOf('#prompt#') > -1) {

      // If the module is executed from the command line, we ask for a password
      // interactively, else we fail.
      if (!module.parent) {
        console.log('Root password needed for network simulation.');
        read({ prompt: 'Password:', silent: true }, function(error, result) {
          child.stdin.write(result + '\n');
        });
      } else {
        console.log('Root privilege required. Please run this script as root.');
        process.exit(3);
      }
    } else {
      console.log('Error: %s', data.toString());
    }
  });

  child.on('close', function() {
    if (callback) {
      callback();
    }
  });
}

// chain the sudoExec calls
function execSudoCmds(cmds, callback, currentCmd) {
  if (currentCmd === undefined) {
    currentCmd = 0;
  }

  if (currentCmd >= cmds.length) {
    if (callback) {
      callback();
    }
    return;
  }

  sudoExec(cmds[currentCmd], function() {
    execSudoCmds(cmds, callback, currentCmd + 1);
  });
}

function getLinuxCommands(latency, bandwidth, port) {
  var setupCmds = [['tc', 'qdisc', 'add', 'dev', 'lo', 'root', 'handle', '1:',
    'prio'],
    ['tc', 'qdisc', 'add', 'dev', 'lo', 'parent', '1:1', 'handle', '30:',
      'netem'],
    ['tc', 'filter', 'add', 'dev', 'lo', 'parent', '1:0', 'protocol', 'ip',
      'u32', 'match', 'ip', 'sport', port, '0xffff', 'flowid', '1:1']];

  if (latency) {
    setupCmds[1] = setupCmds[1].concat(['delay', latency + 'ms']);
  }
  if (bandwidth) {
    setupCmds[1] = setupCmds[1].concat(['rate', prof.bandwidth + 'kbit']);
  }

  var cleanupCmds = [['tc', 'qdisc', 'del', 'dev', 'lo', 'root']];

  return { setup: setupCmds, cleanup: cleanupCmds };
}

function getBSDCommands(latency, bandwidth, port) {
  var setupCmds = [['ipfw', 'pipe', '1', 'config'],
  ['ipfw', 'add', '100', 'pipe', '1', 'ip', 'from', 'localhost', port, 'to',
    'localhost', 'in']];

  if (latency) {
    setupCmds[0] = setupCmds[0].concat(['delay', latency + 'ms']);
  }
  if (bandwidth) {
    setupCmds[0] = setupCmds[0].concat(['bw', bandwidth + 'Kbits/s']);
  }

  var cleanupCmds = [['ipfw', 'delete', '100'],
    ['ipfw', 'pipe', '1', 'delete']];

  return { setup: setupCmds, cleanup: cleanupCmds };
}

var getCmds = null;

switch (process.platform) {
  case 'darwin':
  case 'bsd':
    getCmds = getBSDCommands;
    break;
  case 'linux':
    getCmds = getLinuxCommands;
    break;
  default:
    throw new Error('System not supported.');
}

function applyProfile(prof, callback) {
  if (!prof.latency && !prof.bandwidth) {
    if (callback) {
      callback();
    }
    return;
  }

  var cmds = getCmds(prof.latency, prof.bandwidth, config.proxy.port).setup;
  execSudoCmds(cmds, callback);
}

function cleanup(callback) {
  execSudoCmds(getCmds().cleanup, callback);
}

// CLI

function displayUsage() {
  console.log('Usage: %s %s network-type', process.argv[0], process.argv[1]);
  console.log('\t- network-type: default to restore system default, or' +
              ' 2G|3G|4G to apply the given profile.');
}

// check if the file is executed directly or required
if (!module.parent) {
  if (process.argv.length !== 3) {
    console.log('Incorrect number of arguments.');
    displayUsage();
    process.exit(1);
  }

  var profArg = process.argv[2];
  if (profArg === 'default') {
    cleanup();
  } else {
    var profile = NETWORK_CONFIGS[profArg];
    if (!profile) {
      console.log('Incorrect profile name.');
      displayUsage();
      process.exit(1);
    }

    applyProfile(profile);
  }
}

// Exports

exports.setupNetworkProfile = function(profileName, callback) {
  applyProfile(NETWORK_CONFIGS[profileName], callback);
};

exports.cleanup = cleanup;
