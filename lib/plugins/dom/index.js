'use strict';

var CONFIG = require('config');
var util = require('../util');
var cheerio = require('cheerio');
var Iconv = require('iconv').Iconv;

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
      var bufs = [];
      uncompressedSource.on('data', function(buf) {
        docdata += buf.toString();
        bufs.push(buf);
      });

      uncompressedSource.on('end', function() {
        var parseTimer = metrics.timer('parse');

        // We check if the page set a charset
        var charsetRegex = /charset=["']?([-:a-zA-Z0-9]+)["']?/;
        var charset = charsetRegex.exec(docdata);

        // If it's not already UTF-8 we convert to it
        if (charset !== null && charset[1].toUpperCase() !== 'UTF-8') {
          request.debug('Converting from %s to UTF-8.', charset[1]);
          var converter = new Iconv(charset[1], 'UTF-8');

          try {
            docdata = converter.convert(Buffer.concat(bufs)).toString();

            // Set the new charset in the document and in the request header
            // (request charset prevail over document charset)
            docdata = docdata.replace(/charset=(["']?)[-:a-zA-Z0-9]+(["']?)/,
                                      'charset=$1UTF-8$2');
            source.headers['content-type'] = 'text/html charset=UTF-8';
          } catch (e) {
            request.error('Unable to convert to UTF-8.');
            dest.writeHead(statusCode, headers);
            dest.write(Buffer.concat(bufs), function() {
              dest.end();
            });

            return;
          }
        }

        var $ = cheerio.load(docdata, { decodeEntities: false });
        parseTimer.stop();

        var i = 0;
        function nextPlugin() {
          if (i < plugins.length) {
            plugins[i++].handleDOMResponse(request, uncompressedSource, $,
                                           nextPlugin, options);
          } else {
            dest.writeHead(statusCode, headers);
            // No more DOM plugins, write out the new (presumably changed) DOM
            dest.write($.html(), function() {
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
