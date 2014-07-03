'use strict';

var CONFIG = require('config');

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

    plugin.handleRequest(request, response, options, function(err, handled) {
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

  function nextPlugin() {
    if (plugins.length === 0) {
      return;
    }

    var plugin = plugins.shift();

    currentDest = plugins.length === 0 ?
                  dest :
                  new util.PipedResponse(currentSource, plugin.name);

    // We want to wait until the currentSource has header information
    // before passing it on to the next plugin. The original one already
    // has this, but the PipedResponse does not have it until the plugin
    // calls writeHead() on it. This can happen immediately in the
    // handleResponse() call or later on.
    if (!currentSource.headers) {
      currentSource.once('head', function() {
        plugin.handleResponse(request, currentSource, currentDest, options);
        currentSource = currentDest;
        nextPlugin();
      });
    } else {
      plugin.handleResponse(request, currentSource, currentDest, options);
      currentSource = currentDest;
      nextPlugin();
    }
  }

  nextPlugin();
};
