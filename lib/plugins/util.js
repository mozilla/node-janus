'use strict';

var util = require('util');
var Duplex = require('stream').Duplex;
var fs = require('fs');
var join = require('path').join;
var yaml = require('js-yaml');
var log = require('../log');

var CONFIG = require('config');

var shouldUsePlugin = exports.shouldUsePlugin = function(plugin, options) {
  var pluginConfig = CONFIG[plugin.name];
  if (!pluginConfig) {
    // Plugins disabled by default
    return false;
  }

  if (pluginConfig.optional) {
    if (pluginConfig.enabled) {
      // We are enabled unless listed in the disable list
      return options.disabled.indexOf(plugin.name) < 0;
    }

    // We are disabled unless listed in the enable list
    return options.enabled.indexOf(plugin.name) >= 0;
  }

  if (pluginConfig.hasOwnProperty('enabled')) {
    return pluginConfig.enabled;
  }

  return true;
};

exports.filterPlugins = function(plugins, options) {
  return plugins.filter(function(plugin) {
    return shouldUsePlugin(plugin, options);
  });
};

exports.loadPluginsSync = function(dir, config) {
  var manifest = yaml.safeLoad(fs.readFileSync(join(dir,
    'plugins.yaml'), 'utf8'));

  var plugins = {};

  Object.keys(manifest).forEach(function(key) {
    plugins[key] = [];
    manifest[key].forEach(function(moduleName) {
      var p = require(join(dir, moduleName));
      if (!config[p.name] ||
          (!config[p.name].enabled && !config[p.name].optional))
      {
        log.debug('disabled plugin: ' + p.name);
        return;
      }

      if (p.init) {
        p.init(config);
      }

      plugins[key].push(p);
    });
  });

  log.debug('loaded plugins in %s:', dir);

  var names = {};
  Object.keys(plugins).forEach(function(type) {
    names[type] = plugins[type].map(function(p) { return p.name; });
  });
  log.debug(names);

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

function PipedResponse(response, name) {
  Duplex.call(this);

  this._statusCode = 0;
  this._headers = null;
  this._name = name;
  this._pendingPipeDest = null;

  this.__defineGetter__('statusCode', function() {
    return this._statusCode;
  });

  this.__defineSetter__('statusCode', function() {
    throw new Error('Not allowed to set statusCode directly, use writeHead()');
  });

  this.__defineGetter__('headers', function() {
    return this._headers;
  });

  this.__defineSetter__('headers', function() {
    throw new Error('Not allowed to set headers directly, use writeHead()');
  });

  // Start off paused. Readers need to explicitly resume to begin receiving
  // events.
  this.pause();
  this.on('finish', function() {
    // push EOF
    this.push(null);
  });

  this.on('resume', function() {
    if (this.statusCode && this.headers) {
      this.emit('head', this.statusCode, this.headers);
    }
  });
}

util.inherits(PipedResponse, Duplex);

PipedResponse.prototype._read = function() {
  // Chunks are immediately written to the read buffer in _write,
  // no work to do here
};

PipedResponse.prototype._write = function(chunk, encoding, callback) {
  if (!this.statusCode || !this.headers) {
    throw new Error(this._name + ' must call writeHead() before writing data!');
  }

  this.push(chunk);
  callback();
};

PipedResponse.prototype.forward = function(dest) {
  if (!this.statusCode) {
    this._pendingPipeDest = dest;
  } else {
    if (!dest.headers) {
      dest.writeHead(this.statusCode, this.headers);
    }
    this.pipe(dest);
  }
};

PipedResponse.prototype.writeHead = function(statusCode, headers) {
  if (this._statusCode || this._headers) {
    throw new Error(this._name + ' Already wrote head! ' +
      this._statusCode + ', ' + JSON.stringify(this._headers));
  }

  this._statusCode = statusCode;
  this._headers = util._extend(headers, {});
  this.emit('head', this.statusCode, this.headers);

  if (this._pendingPipeDest) {
    this.pipe(this._pendingPipeDest);
    this.pendingPipeDest = null;
  }
};

exports.PipedResponse = PipedResponse;
