'use strict';

var winston = require('winston');
var cluster = require('cluster');

var label = cluster.isMaster ? 'Master ' + process.pid :
  'Worker ' + cluster.worker.process.pid;

var level = require('config').logging.level;

function createLogger(level, label) {
  return new winston.Logger({
    transports: [
      new winston.transports.Console({
        level: level,
        timestamp: true,
        label: label || null
      })
    ]
  });
}

var logger = createLogger(level, label);

exports.log = logger.log.bind(logger);
exports.debug = logger.debug.bind(logger);
exports.info = logger.info.bind(logger);
exports.warn = logger.warn.bind(logger);
exports.error = logger.error.bind(logger);

exports.logify = function(obj, objectLabel) {
  var objectLogger = createLogger(level, label + ', ' + objectLabel);
  objectLogger.extend(obj);
};
