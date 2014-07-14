'use strict';

var winston = require('winston');
var cluster = require('cluster');

var label = cluster.isMaster ? 'Master ' + process.pid :
  'Worker ' + cluster.worker.process.pid;

var LOGGING_CONFIG = require('config').logging;

function createLogger(level, label) {
  return new winston.Logger({
    transports: [
      new winston.transports.Console({
        level: level,
        timestamp: true,
        colorize: LOGGING_CONFIG.colorize,
        label: label || null
      })
    ]
  });
}

var logger = createLogger(LOGGING_CONFIG.level, label);

exports.logger = logger;
exports.log = logger.log.bind(logger);
exports.debug = logger.debug.bind(logger);
exports.info = logger.info.bind(logger);
exports.warn = logger.warn.bind(logger);
exports.error = logger.error.bind(logger);

exports.logify = function(obj, objectLabel) {
  var objectLogger = createLogger(LOGGING_CONFIG.level, label + ', ' +
                                  objectLabel);
  objectLogger.extend(obj);
};
