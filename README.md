# Gonzales - SPDY Privacy Proxy

## Requirements
* Node.js v10.0

## Installation
Gonzales is not published on NPM, so you need to get the code first.

    git clone https://github.com/eamsen/node-gonzales  

Next, use NPM to install all the dependencies.

    cd node-gonzales  
    npm install

And you are ready to go.

## Configuration
### Gonzales
The Gonzales proxy comes with a default configuration suitable for testing.

    node lib/server.js

This starts the proxy at port `55073` and the PAC server at port `55555` using
the example keys provided in `keys/`.

To set custom ports and provide your own certifications, use the command-line
arguments.

    node lib/server.js -p <proxy-port> -a <pac-server-port> -k <key> -c <certificate>

### Firefox
You need [Firefox Nightly](http://nightly.mozilla.org) for SPDY proxy support.
When using self-signed certificates, you need to add it to Firefox first. To do
this, just use Firefox to call the proxy via its host-port combination.

    https://<proxy-host>:<proxy-port>/

This should prompt you to add an exception for the self-signed certificate.

#### Firefox (Desktop)
Now, you can configure the secure proxy in `Preferences/Advanced/Network/Settings`.
Select `Automatic proxy configuration URL` and set it to your custom PAC file or
use the default configuration served by Gonzales.

    http://<gonzales-host>:<pac-server-port>

This will serve a suitable PAC file with the proper host and ports set.

#### Firefox for Android
For Fennec the steps are similar. Open `about:config` and set
`network.proxy.autoconfig_url` to the location of your PAC file or the Gonzales
PAC server.
To load the PAC file and activate the proxy, set `network.proxy.type` to `2`.

## License
MIT License - Copyright (C) 2014 Eugen Sawin
