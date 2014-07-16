'use strict';

var CONFIG = require('config');

var emit = require('../emit');
var util = require('./util');
var ALL_PLUGINS = util.loadPluginsSync(__dirname, CONFIG);

exports.handleRequest = function(request, response, options, callback) {
  var plugins = util.filterPlugins(ALL_PLUGINS.request, options);

  function tryNextPlugin() {
    if (plugins.length === 0) {
      callback(null, false);
      return;
    }

    var plugin = plugins.shift();
    var emitter = emit.get(plugin.name);

    emitter.signal('start', 'request');

    plugin.handleRequest(request, response, options, function(err, handled) {
      emitter.signal('end', 'request');

      if (!err && handled) {
        // The plugin successfully handled the request, abort the series.
        callback(null, true);
      } else {
        tryNextPlugin();
      }
    });
  }

  tryNextPlugin();
};

exports.handleResponse = function(request, source, dest, options) {
  var currentSource = source;
  var currentDest = null;
  var plugins = util.filterPlugins(ALL_PLUGINS.response, options);

  // Shortcut plugins write directly to the destination stream.
  var shortcut = false;

  function nextPlugin() {
    if (plugins.length === 0) {
      return;
    }

    var plugin = plugins.shift();
    var emitter = emit.get(plugin.name);

    var finalize = function() {
      emitter.signal('end', 'response');
    };

    if (plugins.length === 0 && !shortcut) {
      // Last plugin in chain.
      currentDest = dest;
    } else {
      // Pipe for intermediate plugin in chain.
      currentDest = new util.PipedResponse(currentSource, plugin.name);
    }

    shortcut = shortcut || plugin.isShortcut;

    currentDest.on('finish', function() {
      finalize();
    });

    currentDest.on('close', function() {
      request.warn('unexpected close in ' + plugin.name);
      finalize();
    });

    currentDest.on('error', function(e) {
      request.error(plugin.name + ' error: ' + e.message);
      finalize();
    });

    // We want to wait until the currentSource has header information
    // before passing it on to the next plugin. The original one already
    // has this, but the PipedResponse does not have it until the plugin
    // calls writeHead() on it. This can happen immediately in the
    // handleResponse() call or later on.
    if (!currentSource.headers) {
      currentSource.once('head', function() {
        emitter.signal('start', 'response');

        plugin.handleResponse(request, currentSource, currentDest,
                              options, dest);
        currentSource = currentDest;
        nextPlugin();
      });
    } else {
      emitter.signal('start', 'response');

      plugin.handleResponse(request, currentSource, currentDest, options, dest);
      currentSource = currentDest;
      nextPlugin();
    }
  }

  nextPlugin();
};
