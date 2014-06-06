var pkg = require('../package.json');

var CONFIG = require('config');
var GONZALES_NAME = 'Gonzales';
var GONZALES_TITLE = GONZALES_NAME + ' ' + pkg.version;

function showHelp() {
  console.log('%s\n' +
      '-h [--help]        shows help\n' +
      '-v [--version]     shows the version', GONZALES_TITLE);
}

function showVersion() {
  console.log(GONZALES_TITLE);
}

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

function addVersionConfig() {
  CONFIG.version = pkg.version;
  CONFIG.title = GONZALES_TITLE;
  CONFIG.name = GONZALES_NAME;
}

// Parse YAML configuration file and set options.
CONFIG.getConfigSources().forEach(function(config) {
  addVersionConfig();
  console.log('Using configuration %s', config.name);
});

var SpdyProxy = require('./proxy');
var proxy = new SpdyProxy(CONFIG);
proxy.listen(CONFIG.proxy.port);

var PacServer = require('./pac');
var pacServer = new PacServer(CONFIG);
pacServer.listen(CONFIG.pac.port);
