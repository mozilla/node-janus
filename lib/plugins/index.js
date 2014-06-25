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
  plugins.forEach(function(plugin, i) {
    currentDest = i === plugins.length - 1 ?
                  dest :
                  new util.PipedResponse(currentSource);
    plugin.handleResponse(request, currentSource, currentDest, options);
    currentSource = currentDest;
  });
};
