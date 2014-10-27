# Janus - Privacy & Compression Proxy
[![Build Status](https://travis-ci.org/mozilla/node-janus.svg?branch=master)](https://travis-ci.org/mozilla/node-janus)

## Requirements
* [Node.js v10.0](http://nodejs.org)
* [FFmpeg](http://ffmpeg.org/)
* mozjpeg build dependencies (see [mozjpeg build requirements](https://github.com/mozilla/mozjpeg/blob/master/BUILDING.txt))

## Installation
Get the code first.

    git clone https://github.com/mozilla/node-janus

Next, use NPM to install all the dependencies.

    cd node-janus  
    npm install

## Configuration and Usage
### Proxy
You can find the default proxy configuration in `config/default.yml`.
All settings are exposed and documented there.

You may edit the settings directly in the default configuration file or
preferably override some of settings using a custom configuration file,
see the [node-config documentation](https://lorenwest.github.io/node-config/latest/)
for more details about the configuration system.

To start the proxy, just run

    ./proxy

The only command-line arguments supported are `-h` for help and `-v` for
showing the version.

### Firefox
#### Minimal Version
You need at least Firefox 33 ([Firefox Beta](http://beta.mozilla.org)) for SPDY
proxy support.

#### Self-Signed Certificates
When using self-signed certificates, you need to add it to Firefox first. To do
this, use Firefox to call the proxy via its host-port combination.

    https://<proxy.host>:<proxy.port>/

This should prompt you to add an exception for the self-signed certificate.

### Automatic Client Configuration Using the Add-On
The prefered way for using the proxy is by installing the [Janus
add-on](https://addons.mozilla.org/en-US/firefox/addon/janus-proxy-configurator/).
When using the add-on, you can conveniently configure the optional features of
the proxy and view some statistics on bandwidth savings.

Should you have reasons to set up the proxy without the add-on, please follow
the manual instructions next.

### Manual Client Configuration
#### Desktop
You can configure the secure proxy in `Preferences/Advanced/Network/Settings`.
Select `Automatic proxy configuration URL` and set it to your custom PAC file or
use the default configuration served by the integrated PAC server.

    http://<pac.host>:<pac.port>

This will serve a suitable PAC file with the proper host and ports set.
Check `config/default.yml` for the default PAC server connection details.

#### Android
For Fennec the steps are similar. Open `about:config` and set
`network.proxy.autoconfig_url` to the location of your PAC file or the Janus
PAC server.
To load the PAC file and activate the proxy, set `network.proxy.type` to `2`.

## Production Deployment
### Additional Requirements
* [Redis](http://redis.io)
* [StatsD](https://github.com/etsy/statsd)

By default, the proxy uses a basic in-memory cache and does only log basic
metric stats. Additionally, the proxy supports a Redis-based caching solution
and StatsD metrics reporting.

To enable the Redis cache, you need to have a running Redis server instance.
The proxy-side configuration is straight-forward using `config/default.yml`,
where you set the host and port accordingly and switch caching modes by setting
`cache.type`.

To view and process the full metrics, you need a receiver compatible to StatsD
metrics. To establish a connection, simply set the `metrics.statsd` settings
accordingly in `config/default.yml` or your local overriding config files.

## Development
### Additional Requirements
* [spdylay](https://github.com/tatsuhiro-t/spdylay)

### Tests
To run all tests use

    npm test

To get coverage statistics use

    npm run-script coverage

To run performance tests using Marionette you need to point the configuration
to your Firefox binary in file `config/test/test.yml`, setting
`test.firefoxPath`. Then launch the tests using

    npm run-script marionette

To simulate different mobile network environments, use

    npm run-script networksimulation 2G|3G|4G

and stop the system-wide simulation by reverting to the defaults using

    npm run-script networksimulation default

