'use strict';

var log = require('./log');
var cluster = require('cluster');

var pkg = require('../package.json');
var SpdyProxy = require('./proxy');
var PacServer = require('./pac');

var CONFIG = require('config');
var NAME = pkg.name;
var TITLE = NAME + ' ' + pkg.version;

function showHelp() {
  console.log('%s\n' +
      '-h [--help]        shows help\n' +
      '-v [--version]     shows the version', TITLE);
}

function showVersion() {
  console.log(TITLE);
}

if (cluster.isMaster) {
  // Process command-line arguments and return options path.
  (function processArgs() {
    process.argv.forEach(function(value) {
      if (value === '-h' || value === '--help') {
        showHelp();
        process.exit(1);
      }
      if (value === '-v' || value === '--version') {
        showVersion();
        process.exit(1);
      }
    });
  })();
}

function addVersionConfig() {
  CONFIG.version = pkg.version;
  CONFIG.title = TITLE;
  CONFIG.name = NAME;
}

// Parse YAML configuration file and set options.
CONFIG.getConfigSources().forEach(function(config) {
  addVersionConfig();
  log.debug('Using configuration %s', config.name);
});

function getWorkerCount() {
  if (!CONFIG.cluster.enabled) {
    return 0;
  }

  if (CONFIG.cluster.workers.auto) {
    return require('os').cpus().length;
  } else {
    return CONFIG.cluster.workers.count;
  }
}

if (CONFIG.cluster.enabled && cluster.isMaster) {
  var count = getWorkerCount();
  log.debug('starting %d workers', count);
  for (var i = 0; i < count; ++i) {
    cluster.fork();
  }

  cluster.on('exit', function(worker, code) {
    log.debug('worker %d died, exit code %d',
      worker.process.pid, code);
    cluster.fork();
  });
} else {
  var pacServer = new PacServer(CONFIG);
  pacServer.listen(CONFIG.pac.port);

  var proxy = new SpdyProxy(CONFIG);
  proxy.listen(CONFIG.proxy.port);
}
