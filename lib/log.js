'use strict';

var winston = require('winston');
var cluster = require('cluster');
var fs = require('fs');

var util = require('./util');

var label = cluster.isMaster ? 'master ' + process.pid :
  'worker ' + cluster.worker.process.pid;

var LOGGING_CONFIG = require('config').logging;

// Remove the default transports
winston.clear();

if (LOGGING_CONFIG.console && LOGGING_CONFIG.console.enabled) {
  winston.add(winston.transports.Console, {
    level: LOGGING_CONFIG.console.level,
    timestamp: LOGGING_CONFIG.console.timestamp,
    colorize: LOGGING_CONFIG.console.colorize,
    label: label || null
  });
}

if (LOGGING_CONFIG.file && LOGGING_CONFIG.file.enabled) {
  // If the 'clobber' option was specified, remove the existing log file.
  if (LOGGING_CONFIG.file.clobber && LOGGING_CONFIG.file.filename) {
    try {
      fs.unlinkSync(LOGGING_CONFIG.file.filename);
    } catch (err) {
      // Ignore errors
    }
  }

  winston.add(winston.transports.File, {
    level: LOGGING_CONFIG.file.level,
    timestamp: LOGGING_CONFIG.file.timestamp,
    filename: LOGGING_CONFIG.file.filename,
    maxsize: util.mbToByte(LOGGING_CONFIG.file.maxSize),
    json: LOGGING_CONFIG.file.json || false
  });
}

exports.logger = winston;
exports.log = winston.log;
exports.debug = winston.debug;
exports.info = winston.info;
exports.warn = winston.warn;
exports.error = winston.error;

exports.logify = function(obj, objectLabel) {
  ['log', 'debug', 'info', 'warn', 'error'].forEach(function(level) {
    obj[level] = function() {
      var args = Array.prototype.slice.call(arguments);
      if (objectLabel && args.length > 0) {
        args[0] = '[' + objectLabel + '] ' + args[0];
      }

      return winston[level].apply(winston, args);
    };
  });
};
