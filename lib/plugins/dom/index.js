'use strict';

var CONFIG = require('config');
var util = require('../util');
var cheerio = require('cheerio');

var gunzip = require('../gunzip');

var ALL_PLUGINS = util.loadPluginsSync(__dirname, CONFIG);
var NAME = exports.name = 'dom';

var metrics = require('../../metrics').session(NAME);

// Runs DOM manipulations
exports.handleResponse = function(request, source, dest, options) {
  var plugins = util.filterPlugins(ALL_PLUGINS.dom, options);
  if (plugins.length === 0) {
    source.forward(dest);
    source.resume();
    return;
  }

  if (util.matchHeaders(source.headers, { 'content-type': /html/ })) {
    request.debug('intercepting for DOM manipulation: ' +
      source.headers['content-type']);

    // Uncompress if necessary
    var uncompressedSource = new util.PipedResponse(source);
    metrics.streamTimer(uncompressedSource, 'uncompress');

    uncompressedSource.once('head', function(statusCode, headers) {
      var docdata = '';
      uncompressedSource.on('data', function(buf) {
        docdata += buf.toString();
      });

      uncompressedSource.on('end', function() {
        var parseTimer = metrics.timer('parse');
        var $ = cheerio.load(docdata);
        parseTimer.stop();

        var i = 0;
        function nextPlugin() {
          if (i < plugins.length) {
            plugins[i++].handleDOMResponse(request, uncompressedSource, $,
                                           nextPlugin, options);
          } else {
            dest.writeHead(statusCode, headers);
            // No more DOM plugins, write out the new (presumably changed) DOM
            dest.write(new Buffer($.html()), function() {
              dest.end();
            });
          }
        }

        nextPlugin();
      });
    });

    gunzip.handleResponse(request, source, uncompressedSource, options);
    uncompressedSource.resume();
  } else {
    source.forward(dest);
  }

  source.resume();
};
