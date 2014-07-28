'use strict';

var Marionette = require('marionette-client');

var util = require('../../lib/util');
var metrics = require('../../lib/metrics');
var helper = require('../helper/testHelper');

var driver = new Marionette.Drivers.Tcp({});
var client;

require('chai').should();

var websites = [
  'http://google.com',
  'http://facebook.com',
  'http://youtube.com',
  'http://live.com',
  'http://baidu.com',
  'http://blogspot.com',
  'http://wikipedia.org',
  'http://qq.com',
  'http://msn.com',
  'http://yahoo.co.jp',
  'http://taobao.com',
  'http://amazon.com',
  'http://sina.com.cn',
  'http://bing.com',
  'http://ebay.com',
  'http://microsoft.com',
  'http://yandex.ru',
  'http://163.com',
  'http://fc2.com',
  'http://imdb.com',
  'http://vkontakte.ru',
  'http://craigslist.org',
  'http://apple.com',
  'http://sohu.com',
  'http://conduit.com',
  'http://bbc.co.uk',
  'http://go.com',
  'http://tudou.com',
  'http://youku.com',
  'http://soso.com',
  'http://aol.com',
  'http://cnn.com',
  'http://ask.com',
  'http://mediafire.com',
  'http://espn.go.com',
  'http://4shared.com',
  'http://about.com',
  'http://ameblo.jp',
  'http://tumblr.com',
  'http://zedo.com',
  'http://rakuten.co.jp',
  'http://doubleclick.com',
  'http://orkut.com.br',
  'http://adobe.com',
  'http://livejournal.com',
  'http://ebay.de',
  'http://cnet.com',
  'http://ifeng.com',
  'http://sogou.com',
  'http://wordpress.org',
  'http://thepiratebay.org',
  'http://uol.com.br',
  'http://livedoor.com',
  'http://nytimes.com',
  'http://netflix.com',
  'http://amazon.de',
  'http://weather.com',
  'http://alibaba.com',
  'http://fileserve.com',
  'http://ezinearticles.com',
  'http://orkut.com'
];

function getPageSizes(url, stats, cb) {
  metrics.use({
    counter: function(e, val) {
      if (e === 'egress.transfer') {
        stats.egressBytes += val;
      } else if (e === 'ingress.transfer') {
        stats.ingressBytes += val;
      } else if (e === 'proxy.request') {
        stats.requestCount++;
      }
    }
  });

  client.goUrl(url, function() {
    metrics.clients = [];
    cb();
  });
}

function testSizes(url, done) {
  var stats = { ingressBytes: 0, egressBytes: 0, requestCount: 0 };

  function pageLoaded() {
    var totalSizeIngress = Math.round(util.byteToKb(stats.ingressBytes));
    var totalSizeEgress = Math.round(util.byteToKb(stats.egressBytes));

    console.log('[%s] page size %s vs %s: %sKB/%sKB (%d%), %d requests', url,
                'ingress'.green,
                'egress'.blue, totalSizeIngress.toString().green,
                totalSizeEgress.toString().blue,
                helper.getPercentage(totalSizeEgress, totalSizeIngress),
                stats.requestCount);

    totalSizeEgress.should.be.at.most(totalSizeIngress);

    done();
  }

  getPageSizes(url, stats, pageLoaded);
}

module.exports = {
  before: function(done) {
    this.timeout(25000);
    helper.loadProxy();
    helper.launchFirefox();
    driver.connect(function() {
      client = new Marionette.Client(driver);
      client.startSession(function() {
        done();
      });
    });
  },

  after: function() {
    helper.cleanAll();
  },
};

websites.forEach(function(url) {
  module.exports[url] = function(done) {
    // Set high timeout, with network simulation page loads can be very slow...
    this.timeout(180000);
    testSizes(url, done);
  };
});
