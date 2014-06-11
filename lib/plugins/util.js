'use strict';

var util = require('util');
var Duplex = require('stream').Duplex;
var fs = require('fs');
var join = require('path').join;
var yaml = require('js-yaml');

exports.loadPluginsSync = function(dir, config) {
  var manifest = yaml.safeLoad(fs.readFileSync(join(dir,
    'plugins.yaml'), 'utf8'));

  var plugins = {};

  Object.keys(manifest).forEach(function(key) {
    plugins[key] = [];
    manifest[key].forEach(function(moduleName) {
      var p = require(join(dir, moduleName));
      if (config[p.name] &&
          config[p.name].hasOwnProperty('enabled') &&
          !config[p.name].enabled) {
        console.log('blocked plugin: ' + p.name);
        return;
      }

      plugins[key].push(p);
    });
  });

  console.log('loaded plugins in %s:', dir);

  var names = {};
  Object.keys(plugins).forEach(function(type) {
    names[type] = plugins[type].map(function(p) { return p.name; });
  });
  console.dir(names);

  return plugins;
};

exports.matchHeaders = function(headers, query) {
  var headerNames = Object.keys(query);
  for (var i = 0; i < headerNames.length; i++) {
    var headerName = headerNames[i];
    var queryVal = query[headerName];
    var headerVal = headers[headerName] || '';

    var truthyHeaderVal = Boolean(headerVal);
    if (typeof queryVal === 'boolean' &&
        truthyHeaderVal !== queryVal) {
      return false;
    }

    if (queryVal instanceof RegExp &&
        !headerVal.match(queryVal)) {
      return false;
    }

    if (typeof queryVal === 'string' &&
        headerVal !== queryVal) {
      return false;
    }
  }

  return true;
};

function PipedResponse(response, options) {
  this.statusCode = response.statusCode;
  this.headers = util._extend(response.headers, {});

  if (response instanceof PipedResponse) {
    this.accumulate = response.accumulate;
    this.contentLengthChange = response.contentLengthChange;
  } else {
    this.accumulate = true;
    this.contentLengthChange = false;
  }

  this._read = function() {
    // Chunks are immediately written to the read buffer in _write,
    // no work to do here
  };

  this._write = function(chunk, encoding, callback) {
    this.push(chunk);
    callback();
  };

  this.writeHead = function(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = util._extend(headers, {});
  };

  Duplex.call(this, options);

  // Start off paused. Readers need to explicitly resume to begin receiving
  // events.
  this.pause();
  this.on('finish', function() {
    // push EOF
    this.push(null);
  });
}
util.inherits(PipedResponse, Duplex);

exports.PipedResponse = PipedResponse;
