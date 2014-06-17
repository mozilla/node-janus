'use strict';

var winston = require('winston');

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

var logger = createLogger(level);

exports.log = logger.log.bind(logger);
exports.debug = logger.debug.bind(logger);
exports.info = logger.info.bind(logger);
exports.warn = logger.warn.bind(logger);
exports.error = logger.error.bind(logger);

exports.logify = function(obj, label) {
  var objectLogger = createLogger(level, label);
  objectLogger.extend(obj);
};
