'use strict';

var spawn = require('child_process').spawn;
var phantom = require('phantom');
var util = require('../../lib/util');
var emit = require('../../lib/emit');

var helper = require('../helper/testHelper');
var config = require('config').test;

require('chai').should();

var websites = [
  'http://www.mozilla.org/en-US/',
  'http://www.google.com/',
  'http://news.google.com/news',
  'http://www.cnn.com/',
  'http://www.nytimes.com/',
  'http://espn.go.com',
  'http://imgur.com',
  'http://cbs.com',
  'http://nbc.com',
  'http://abc.com',
];

// phantomJS instances (with and without proxy)
var phProxy = null;

function getPercentage(a, b) {
  return (100 - (b * 100) / a).toFixed(2);
}

function getPageSizes(ph, url, metrics, cb) {
  emit.get('ingress').on('count', function(e, val) {
    if (e === 'ingress.transfer') {
      metrics.ingressBytes += val;
    }
  });

  emit.get('egress').on('count', function(e, val) {
    if (e === 'egress.transfer') {
      metrics.egressBytes += val;
    }
  });

  emit.get('proxy').on('count', function(e) {
    if (e === 'proxy.request') {
      metrics.requestCount++;
    }
  });

  ph.createPage(function(page) {
    page.open(url, function() {
      setTimeout(function() {
        emit.get('ingress').removeAllListeners('count');
        emit.get('egress').removeAllListeners('count');
        emit.get('proxy').removeAllListeners('count');

        page.close();
        cb();
      }, 2000);
    });
  });
}

function testSizes(url, done) {
  var metrics = { ingressBytes: 0, egressBytes: 0, requestCount: 0 };

  function pageLoaded() {
    var totalSizeIngress = Math.round(util.byteToKb(metrics.ingressBytes));
    var totalSizeEgress = Math.round(util.byteToKb(metrics.egressBytes));

    console.log('[%s] page size %s vs %s: %sKB/%sKB (%d%), %d requests', url,
                'ingress'.green,
                'egress'.blue, totalSizeIngress.toString().green,
                totalSizeEgress.toString().blue,
                getPercentage(totalSizeEgress, totalSizeIngress),
                metrics.requestCount);

    totalSizeEgress.should.be.at.most(totalSizeIngress);

    done();
  }

  getPageSizes(phProxy, url, metrics, pageLoaded);
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

          helper.loadProxy();
          done();
        });
    },

    after: function() {
      phProxy.exit();
      shrpx.kill('SIGINT');
      helper.cleanAll();
    },
  };

  websites.forEach(function(url) {
    module.exports[url] = function(done) {
      var TIMEOUT = 30000;
      this.timeout(TIMEOUT);
      testSizes(url, done);
    };
  });
}
