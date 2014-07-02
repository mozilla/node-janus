'use strict';

var spawn = require('child_process').spawn;
var phantom = require('phantom');
var util = require('../../lib/util');

var helper = require('../helper/testHelper');
var config = require('config').test;

require('chai').should();

var websites = [
  'http://www.mozilla.org/en-US/',
  'http://www.google.com/',
  'http://news.google.com/news',
  'http://www.cnn.com/',
  'http://www.nytimes.com/',
];

// phantomJS instances (with and without proxy)
var phProxy = null;
var phDirect = null;

function initSizeStats() {
  return {
    images: 0,
    text: 0,
    other: 0,
    resources: {
      images: [],
      text: [],
      other: []
    },
  };
}

function getStatsSum(stats) {
  return stats.images + stats.text + stats.other;
}

function convertToKb(stats) {
  stats.images = Math.round(util.byteToKb(stats.images));
  stats.text = Math.round(util.byteToKb(stats.text));
  stats.other = Math.round(util.byteToKb(stats.other));
}

function getPercentage(a, b) {
  return (100 - (b * 100) / a).toFixed(2);
}

// Display all the resources downloaded via the proxy that are larger than
// their equivalent directly downloaded or that have been downloaded only
// through the proxy.
function displayLargerResources(proxy, noProxy) {
  for (var url in proxy) {
    if (proxy.hasOwnProperty(url)) {
      var sizeProxy = proxy[url];
      var sizeNP = noProxy[url];

      if (sizeNP) {
        if (sizeProxy > sizeNP) {
          console.log('\t\t\t- %s is %s: %dKB vs %dKB', url, 'bigger'.yellow,
                     sizeProxy, sizeNP);
        }
      } else {
        console.log('\t\t\t- %s was %s (only loaded in proxy)', url,
                    'not loaded'.red);
      }
    }
  }
}

function getPageSizes(ph, url, size, cb) {
  ph.createPage(function(page) {
    page.set('onResourceReceived', function(response) {
      if (response.stage === 'start') {
        var resourceSize = 0;

        response.headers.some(function(elt) {
          if (elt.name === 'Content-Length') {
            resourceSize = parseInt(elt.value);
            return true;
          }

          return false;
        });

        if (response.contentType &&
            response.contentType.indexOf('image') !== -1) {
          size.images += resourceSize;
          size.resources.images[response.url] =
            Math.round(util.byteToKb(resourceSize));
        } else if (response.contentType &&
                   response.contentType.indexOf('text') !== -1) {
          size.text += resourceSize;
          size.resources.text[response.url] =
            Math.round(util.byteToKb(resourceSize));
        } else {
          size.other += resourceSize;
          size.resources.other[response.url] =
            Math.round(util.byteToKb(resourceSize));
        }
      }
    });

    page.open(url, function() {
      page.close();
      cb();
    });
  });
}

function testSizes(url, done) {
  var firstDone = false;

  var totalSizeDirect = initSizeStats();
  var totalsizeProxy = initSizeStats();

  function pageLoaded() {
    // If this is the first page to finish we wait for the other one...
    if (!firstDone) {
      firstDone = true;
      return;
    }

    convertToKb(totalsizeProxy);
    convertToKb(totalSizeDirect);
    var sumProxy = getStatsSum(totalsizeProxy);
    var sumNP = getStatsSum(totalSizeDirect);
    console.log('* %s', url);
    console.log('\tPage size %s vs %s: %sKB/%sKB (%d%)', 'proxy'.green,
                'no proxy'.blue, sumProxy.toString().green,
                sumNP.toString().blue, getPercentage(sumProxy, sumNP));
    console.log('\t\tImages: %sKB/%sKB (%d%)',
                totalsizeProxy.images.toString().green,
                totalSizeDirect.images.toString().blue,
                getPercentage(totalsizeProxy.images,
                              totalSizeDirect.images));
    if (totalsizeProxy.images > totalSizeDirect.images) {
      displayLargerResources(totalsizeProxy.resources.images,
                              totalSizeDirect.resources.images);
    }
    console.log('\t\tText: %sKB/%sKB (%d%)',
                totalsizeProxy.text.toString().green,
                totalSizeDirect.text.toString().blue,
                getPercentage(totalsizeProxy.text, totalSizeDirect.text));
    if (totalsizeProxy.text > totalSizeDirect.text) {
      displayLargerResources(totalsizeProxy.resources.text,
                              totalSizeDirect.resources.text);
    }
    console.log('\t\tOther: %sKB/%sKB (%d%)',
                totalsizeProxy.other.toString().green,
                totalSizeDirect.other.toString().blue,
                getPercentage(totalsizeProxy.other, totalSizeDirect.other));
    if (totalsizeProxy.other > totalSizeDirect.other) {
      displayLargerResources(totalsizeProxy.resources.other,
                              totalSizeDirect.resources.other);
    }

    sumProxy.should.be.at.most(sumNP);

    done();
  }

  getPageSizes(phProxy, url, totalsizeProxy, pageLoaded);
  getPageSizes(phDirect, url, totalSizeDirect, pageLoaded);
}

var shrpx = null;

if (config.performance && config.performance.enabled) {
  module.exports = {
    before: function(done) {
      phantom.create('--proxy=' + config.phantom.host + ':' +
        config.phantom.port,
        '--proxy-type=http',
        function(p) {
          phProxy = p;

          shrpx = spawn('shrpx', ['-k', '-p', '-b', config.proxy.host +
          ',' + config.proxy.port]);

          phantom.create(function(p) {
            phDirect = p;
            helper.loadProxy();
            done();
          });
        });
    },

    after: function() {
      phProxy.exit();
      phDirect.exit();
      shrpx.kill('SIGINT');
      helper.cleanAll();
    },
  };

  websites.forEach(function(url) {
    module.exports[url] = function(done) {
      var TIMEOUT = 10000;
      this.timeout(TIMEOUT);
      testSizes(url, done);
    };
  });
}
