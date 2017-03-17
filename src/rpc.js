const http = require('http');
const assert = require('assert');


const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 3292;


function RPC(hyperg, port, host) {
    this.port = port || DEFAULT_PORT;
    this.host = host || DEFAULT_HOST;
    this.hyperg = hyperg;
}

RPC.prototype.listen = function() {
    var self = this;

    self.server = http.createServer((request, response) => {
        self._route(self, request, response);
    });

    // FIXME: keepalive
    self.server.setTimeout(10 * 120 * 1000);

    self.server.on('error', error => {
        console.error('Hyperdrive: Error listening on',
                      self.host + ':' + self.port,
                      ':', error.code);
        process.exit(1);
    });

    return new Promise((cb, err) => {
        self.server.once('listening', error => {
            if (error) err(error);
            else cb();
        });
        self.server.listen(self.port, self.host);
    });
}

RPC.prototype._route = function(ctx, request, response) {
    var self = ctx;
    var body = [], json;

    try {
        self._validate_request(request);
    } catch (error) {
        return self._respond({
            error: error
        }, response, 400);
    }

    request.on('error', error => {

        self._respond({
            error: error.message
        }, response, 400);

    }).on('data', chunk => {

        body.push(chunk);

    }).on('end', () => {

        body = body.join('');

        try {
            json = JSON.parse(body);
        } catch(exc) {
            return self._respond({
                error: exc.message
            }, response, 400);
        }

        if (!self._commands.hasOwnProperty(json.command)) {
            return self._respond({
                error: 'Invalid command'
            }, response, 400);
        }

        try {
            self._commands[json.command](self, json, response);
        } catch(exc) {
            console.error('err', exc);
            return self._respond({
                error: exc.message
            }, response, 400);
        }
    });
}

RPC.prototype._commands = {
    id: (self, json, response) => {
        self._respond({
            id: self.hyperg.id
        }, response);
    },
    download: (self, json, response) => {
        assert.ok(json.hash);
        assert.ok(json.dest);

        self.hyperg.download(json.hash, json.dest)
            .then(success => {
                self._respond({
                    files: success
                }, response);
            }, error => {
                console.error("RPC error (download)", error);
                self._respond({
                    error: error
                }, response, 400);
            });
    },
    upload: (self, json, response) => {

        if (!json.hash)
            try {
                assert.ok(json.files);
                json.files = Object.keys(json.files)
                    .map(key => {
                        return [key, json.files[key]];
                    });
            } catch (error) {
                console.error("RPC error (upload)", error);
                return self._respond({
                        error: error.message
                    }, response, 400);
            }

        self.hyperg.upload(json.id, json.files, json.hash)
            .then(success => {
                self._respond({
                    hash: success
                }, response);
            }, error => {
                console.error("RPC error (upload)", error);
                self._respond({
                    error: error
                }, response, 400);
            });
    },
    cancel: (self, json, response) => {
        assert.ok(json.hash);

        self.hyperg.cancel_upload(json.hash)
            .then(success => {
                self._respond({
                    hash: success
                }, response);
            }, error => {
                console.error("RPC error (cancel)", error);
                self._respond({
                    error: error
                }, response, 404);
            });
    }
}

RPC.prototype._validate_request = function(request) {
    if (request.method.toLowerCase() != 'post')
        throw 'Invalid request method';
    if (request.headers['content-type'] != 'application/json')
        throw 'Invalid content type';
}

RPC.prototype._respond = function(data, response, code) {
    var response_data = data
        ? JSON.stringify(data)
        : '';

    response.statusCode = code || 200;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Content-Length', Buffer.byteLength(response_data));
    response.write(response_data);
    response.end();
}

module.exports = RPC;
